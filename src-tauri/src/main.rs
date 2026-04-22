#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::Value;
use std::{
    collections::{BTreeSet, HashMap},
    fs::{self, File},
    io::{Seek, Write},
    path::{Component, PathBuf},
};
use tauri::{path::BaseDirectory, AppHandle, Manager, Window};
use tauri_plugin_dialog::DialogExt;
use zip::{write::FileOptions, CompressionMethod, ZipWriter};

const DEFAULT_SCENARIO_RESOURCE: &str = "assets/demo_scenario.md";
const MAX_SLIDES: usize = 200;
const MAX_SLIDE_CHARS: usize = 4000;
const MAX_MEDIA_FILE_BYTES: u64 = 5 * 1024 * 1024;
const MAX_MEDIA_TOTAL_BYTES: u64 = 50 * 1024 * 1024;
const CORE_TIMESTAMP: &str = "2026-04-20T00:00:00Z";

#[derive(Clone)]
struct SlideData {
    text: String,
    background: Option<String>,
}

struct MediaAsset {
    index: usize,
    file_name: String,
    extension: String,
    bytes: Vec<u8>,
}

#[tauri::command]
fn load_scenario(app: AppHandle, path: Option<String>) -> Result<String, String> {
    read_scenario_resource(&app, path.as_deref())
}

#[tauri::command]
async fn export_pptx(window: Window, ast: Value) -> Result<String, String> {
    let app = window.app_handle();
    let slides = parse_say_slides_from_ast(&ast)?;
    let media_assets = collect_media_assets(&app, &slides);

    let output_path = window
        .dialog()
        .file()
        .set_parent(&window)
        .add_filter("PowerPoint Presentation", &["pptx"])
        .blocking_save_file()
        .ok_or_else(|| "export canceled".to_string())?
        .into_path()
        .map_err(|_| "invalid path selected".to_string())?;

    write_pptx(&output_path, &slides, &media_assets).map_err(|err| {
        eprintln!("[Engine Internal] export_pptx write failed: {}", err);
        "operation rejected".to_string()
    })?;
    Ok(output_path.display().to_string())
}

fn read_scenario_resource(app: &AppHandle, path: Option<&str>) -> Result<String, String> {
    let resource_key = resolve_scenario_resource_key(path)?;
    let resource_path = app
        .path()
        .resolve(&resource_key, BaseDirectory::Resource)
        .map_err(|err| {
            eprintln!(
                "[Engine Internal] load_scenario resolve failed key='{}': {}",
                resource_key, err
            );
            "operation rejected".to_string()
        })?;

    match fs::read_to_string(&resource_path) {
        Ok(content) => Ok(content),
        Err(primary_err) => {
            // tauri dev may stage resources under target/debug/_up_/...
            let fallback_path = app
                .path()
                .resolve(format!("_up_/{resource_key}"), BaseDirectory::Resource)
                .map_err(|_| "operation rejected".to_string())?;
            fs::read_to_string(&fallback_path).map_err(|fallback_err| {
                eprintln!(
                    "[Engine Internal] load_scenario failed path='{}': {}; fallback='{}': {}",
                    resource_path.display(),
                    primary_err,
                    fallback_path.display(),
                    fallback_err
                );
                "operation rejected".to_string()
            })
        }
    }
}

fn resolve_scenario_resource_key(path: Option<&str>) -> Result<String, String> {
    match path {
        None | Some("") | Some("demo") => Ok(DEFAULT_SCENARIO_RESOURCE.to_string()),
        Some(raw) => {
            let candidate = std::path::PathBuf::from(raw);
            if candidate.is_absolute() {
                return Err("operation rejected".to_string());
            }
            if candidate.components().any(|part| {
                matches!(
                    part,
                    Component::ParentDir | Component::RootDir | Component::Prefix(_)
                )
            }) {
                return Err("operation rejected".to_string());
            }
            let normalized = candidate.to_string_lossy().replace('\\', "/");
            if normalized.is_empty() {
                return Err("operation rejected".to_string());
            }
            if normalized.starts_with("assets/") {
                Ok(normalized)
            } else {
                Ok(format!("assets/{normalized}"))
            }
        }
    }
}

fn parse_say_slides_from_ast(ast: &Value) -> Result<Vec<SlideData>, String> {
    let commands = ast
        .as_array()
        .ok_or_else(|| "operation rejected".to_string())?;

    let mut slides: Vec<SlideData> = Vec::new();
    let mut current_bg: Option<String> = None;
    for command in commands {
        let Some(command_obj) = command.as_object() else {
            continue;
        };
        let Some(op) = command_obj.get("op").and_then(Value::as_str) else {
            continue;
        };

        if op == "asset" {
            let args = command_obj.get("args").and_then(Value::as_object);
            let asset_type = args
                .and_then(|value| value.get("type"))
                .and_then(Value::as_str);
            if asset_type == Some("bg") {
                let bg_src = args
                    .and_then(|value| value.get("src"))
                    .and_then(Value::as_str);
                if let Some(src) = bg_src {
                    match resolve_asset_resource_key(src) {
                        Ok(key) => current_bg = Some(key),
                        Err(err) => {
                            current_bg = None;
                            eprintln!(
                                "[Engine Internal] export_pptx asset bg path rejected src='{}': {}",
                                src, err
                            );
                        }
                    }
                } else {
                    current_bg = None;
                }
            }
            continue;
        }

        if op != "say" {
            continue;
        }

        let text = command_obj
            .get("args")
            .and_then(Value::as_object)
            .and_then(|args| args.get("text"))
            .and_then(Value::as_str);

        if let Some(raw) = text {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                continue;
            }
            slides.push(SlideData {
                text: trimmed.chars().take(MAX_SLIDE_CHARS).collect::<String>(),
                background: current_bg.clone(),
            });
            if slides.len() >= MAX_SLIDES {
                return Ok(slides);
            }
        }
    }

    if slides.is_empty() {
        slides.push(SlideData {
            text: "f-core export".to_string(),
            background: current_bg,
        });
    }
    Ok(slides)
}

fn collect_media_assets(app: &AppHandle, slides: &[SlideData]) -> HashMap<String, MediaAsset> {
    let mut media_assets: HashMap<String, MediaAsset> = HashMap::new();
    let mut total_bytes: u64 = 0;

    for slide in slides {
        let Some(bg_key) = slide.background.as_ref() else {
            continue;
        };
        if media_assets.contains_key(bg_key) {
            continue;
        }

        let extension = match detect_image_extension(bg_key) {
            Ok(value) => value,
            Err(err) => {
                eprintln!(
                    "[Engine Internal] export_pptx skipped bg='{}': {}",
                    bg_key, err
                );
                continue;
            }
        };
        let bytes = match read_resource_bytes(app, bg_key) {
            Ok(value) => value,
            Err(err) => {
                eprintln!(
                    "[Engine Internal] export_pptx skipped bg='{}': {}",
                    bg_key, err
                );
                continue;
            }
        };
        let bytes_len = bytes.len() as u64;
        if total_bytes.saturating_add(bytes_len) > MAX_MEDIA_TOTAL_BYTES {
            eprintln!(
                "[Engine Internal] export_pptx media budget exceeded at bg='{}'; limit={} bytes",
                bg_key, MAX_MEDIA_TOTAL_BYTES
            );
            continue;
        }

        total_bytes = total_bytes.saturating_add(bytes_len);
        let index = media_assets.len() + 1;
        let file_name = format!("image{index}.{extension}");
        media_assets.insert(
            bg_key.clone(),
            MediaAsset {
                index,
                file_name,
                extension,
                bytes,
            },
        );

        if total_bytes == MAX_MEDIA_TOTAL_BYTES {
            break;
        }
    }

    media_assets
}

fn resolve_asset_resource_key(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("operation rejected".to_string());
    }

    let sanitized = trimmed.replace('\\', "/");
    let candidate = PathBuf::from(sanitized);
    if candidate.is_absolute() {
        return Err("operation rejected".to_string());
    }

    let mut normalized_parts: Vec<String> = Vec::new();
    for part in candidate.components() {
        match part {
            Component::Prefix(_) | Component::RootDir => {
                return Err("operation rejected".to_string())
            }
            Component::CurDir => {}
            Component::ParentDir => {
                if normalized_parts.pop().is_none() {
                    return Err("operation rejected".to_string());
                }
            }
            Component::Normal(segment) => {
                let Some(segment_str) = segment.to_str() else {
                    return Err("operation rejected".to_string());
                };
                if segment_str.is_empty() {
                    continue;
                }
                normalized_parts.push(segment_str.to_string());
            }
        }
    }

    if normalized_parts.is_empty() {
        return Err("operation rejected".to_string());
    }
    if normalized_parts.first().map(String::as_str) != Some("assets") {
        normalized_parts.insert(0, "assets".to_string());
    }
    if normalized_parts.len() < 2 {
        return Err("operation rejected".to_string());
    }
    Ok(normalized_parts.join("/"))
}

fn detect_image_extension(resource_key: &str) -> Result<String, String> {
    let ext = PathBuf::from(resource_key)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .ok_or_else(|| "operation rejected".to_string())?;

    match ext.as_str() {
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "svg" => Ok(ext),
        _ => Err("operation rejected".to_string()),
    }
}

fn read_resource_bytes(app: &AppHandle, resource_key: &str) -> Result<Vec<u8>, String> {
    let resource_path = app
        .path()
        .resolve(resource_key, BaseDirectory::Resource)
        .map_err(|_| "operation rejected".to_string())?;

    match read_checked_resource_bytes(&resource_path) {
        Ok(bytes) => Ok(bytes),
        Err(primary_err) => {
            let fallback_path = app
                .path()
                .resolve(format!("_up_/{resource_key}"), BaseDirectory::Resource)
                .map_err(|_| "operation rejected".to_string())?;
            read_checked_resource_bytes(&fallback_path).map_err(|fallback_err| {
                eprintln!(
                    "[Engine Internal] resource read failed path='{}': {}; fallback='{}': {}",
                    resource_path.display(),
                    primary_err,
                    fallback_path.display(),
                    fallback_err
                );
                "operation rejected".to_string()
            })
        }
    }
}

fn read_checked_resource_bytes(path: &PathBuf) -> Result<Vec<u8>, String> {
    let metadata = fs::metadata(path).map_err(|err| format!("metadata failed: {err}"))?;
    if metadata.len() > MAX_MEDIA_FILE_BYTES {
        return Err(format!(
            "media file too large ({} > {} bytes)",
            metadata.len(),
            MAX_MEDIA_FILE_BYTES
        ));
    }

    let bytes = fs::read(path).map_err(|err| format!("read failed: {err}"))?;
    if (bytes.len() as u64) > MAX_MEDIA_FILE_BYTES {
        return Err(format!(
            "media file too large ({} > {} bytes)",
            bytes.len(),
            MAX_MEDIA_FILE_BYTES
        ));
    }
    Ok(bytes)
}

fn write_pptx(
    output_path: &PathBuf,
    slides: &[SlideData],
    media_assets: &HashMap<String, MediaAsset>,
) -> Result<(), String> {
    let file = File::create(output_path).map_err(|err| format!("create failed: {err}"))?;
    let mut zip = ZipWriter::new(file);
    let image_extensions = collect_image_extensions(media_assets);

    write_zip_entry(
        &mut zip,
        "[Content_Types].xml",
        &content_types_xml(slides.len(), &image_extensions),
    )?;
    write_zip_entry(&mut zip, "_rels/.rels", ROOT_RELS_XML)?;
    write_zip_entry(&mut zip, "docProps/core.xml", &doc_props_core_xml())?;
    write_zip_entry(
        &mut zip,
        "docProps/app.xml",
        &doc_props_app_xml(slides.len()),
    )?;
    write_zip_entry(
        &mut zip,
        "ppt/presentation.xml",
        &presentation_xml(slides.len()),
    )?;
    write_zip_entry(
        &mut zip,
        "ppt/_rels/presentation.xml.rels",
        &presentation_rels_xml(slides.len()),
    )?;
    write_zip_entry(
        &mut zip,
        "ppt/slideMasters/slideMaster1.xml",
        SLIDE_MASTER_XML,
    )?;
    write_zip_entry(
        &mut zip,
        "ppt/slideMasters/_rels/slideMaster1.xml.rels",
        SLIDE_MASTER_RELS_XML,
    )?;
    write_zip_entry(
        &mut zip,
        "ppt/slideLayouts/slideLayout1.xml",
        SLIDE_LAYOUT_XML,
    )?;
    write_zip_entry(
        &mut zip,
        "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
        SLIDE_LAYOUT_RELS_XML,
    )?;
    write_zip_entry(&mut zip, "ppt/theme/theme1.xml", THEME_XML)?;

    let mut sorted_media_assets: Vec<&MediaAsset> = media_assets.values().collect();
    sorted_media_assets.sort_by_key(|asset| asset.index);
    for media in sorted_media_assets {
        write_zip_entry_bytes(
            &mut zip,
            &format!("ppt/media/{}", media.file_name),
            &media.bytes,
        )?;
    }

    for (index, slide) in slides.iter().enumerate() {
        let slide_no = index + 1;
        let background_media = slide
            .background
            .as_ref()
            .and_then(|bg_key| media_assets.get(bg_key));

        write_zip_entry(
            &mut zip,
            &format!("ppt/slides/slide{slide_no}.xml"),
            &slide_xml(&slide.text, background_media.map(|_| "rId2")),
        )?;
        write_zip_entry(
            &mut zip,
            &format!("ppt/slides/_rels/slide{slide_no}.xml.rels"),
            &slide_rels_xml(background_media.map(|media| media.file_name.as_str())),
        )?;
    }

    zip.finish()
        .map_err(|err| format!("zip finalize failed: {err}"))?;
    Ok(())
}

fn write_zip_entry<W: Write + Seek>(
    zip: &mut ZipWriter<W>,
    entry_path: &str,
    content: &str,
) -> Result<(), String> {
    let options = FileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644);

    zip.start_file(entry_path, options)
        .map_err(|err| format!("zip start_file failed: {err}"))?;
    zip.write_all(content.as_bytes())
        .map_err(|err| format!("zip write failed: {err}"))?;
    Ok(())
}

fn write_zip_entry_bytes<W: Write + Seek>(
    zip: &mut ZipWriter<W>,
    entry_path: &str,
    content: &[u8],
) -> Result<(), String> {
    let options = FileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644);

    zip.start_file(entry_path, options)
        .map_err(|err| format!("zip start_file failed: {err}"))?;
    zip.write_all(content)
        .map_err(|err| format!("zip write failed: {err}"))?;
    Ok(())
}

fn collect_image_extensions(media_assets: &HashMap<String, MediaAsset>) -> BTreeSet<String> {
    let mut extensions = BTreeSet::new();
    for asset in media_assets.values() {
        extensions.insert(asset.extension.clone());
    }
    extensions
}

fn content_types_xml(slide_count: usize, image_extensions: &BTreeSet<String>) -> String {
    let mut overrides = String::new();
    for i in 1..=slide_count {
        overrides.push_str(&format!(
            r#"<Override PartName="/ppt/slides/slide{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>"#
        ));
    }
    let mut media_defaults = String::new();
    for ext in image_extensions {
        let content_type = image_content_type(ext);
        media_defaults.push_str(&format!(
            r#"<Default Extension="{ext}" ContentType="{content_type}"/>"#
        ));
    }

    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  {media_defaults}
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  {overrides}
</Types>"#
    )
}

fn image_content_type(extension: &str) -> &'static str {
    match extension {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

fn presentation_xml(slide_count: usize) -> String {
    let mut slide_ids = String::new();
    for i in 0..slide_count {
        slide_ids.push_str(&format!(
            r#"<p:sldId id="{}" r:id="rId{}"/>"#,
            256 + i,
            i + 2
        ));
    }

    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst>
    <p:sldMasterId id="2147483648" r:id="rId1"/>
  </p:sldMasterIdLst>
  <p:sldIdLst>{slide_ids}</p:sldIdLst>
  <p:sldSz cx="9144000" cy="6858000" type="screen4x3"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>"#
    )
}

fn presentation_rels_xml(slide_count: usize) -> String {
    let mut relationships = String::new();
    relationships.push_str(
        r#"<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>"#,
    );

    for i in 1..=slide_count {
        relationships.push_str(&format!(
            r#"<Relationship Id="rId{}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide{}.xml"/>"#,
            i + 1,
            i
        ));
    }

    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  {relationships}
</Relationships>"#
    )
}

fn doc_props_core_xml() -> String {
    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:dcmitype="http://purl.org/dc/dcmitype/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>f-core export</dc:title>
  <dc:creator>f-core</dc:creator>
  <cp:lastModifiedBy>f-core</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">{CORE_TIMESTAMP}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">{CORE_TIMESTAMP}</dcterms:modified>
</cp:coreProperties>"#
    )
}

fn doc_props_app_xml(slide_count: usize) -> String {
    let mut titles = String::new();
    for i in 1..=slide_count {
        titles.push_str(&format!("<vt:lpstr>Slide {i}</vt:lpstr>"));
    }

    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
  xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>f-core host</Application>
  <PresentationFormat>Custom</PresentationFormat>
  <Slides>{slide_count}</Slides>
  <Notes>0</Notes>
  <HiddenSlides>0</HiddenSlides>
  <MMClips>0</MMClips>
  <ScaleCrop>false</ScaleCrop>
  <HeadingPairs>
    <vt:vector size="2" baseType="variant">
      <vt:variant><vt:lpstr>Slides</vt:lpstr></vt:variant>
      <vt:variant><vt:i4>{slide_count}</vt:i4></vt:variant>
    </vt:vector>
  </HeadingPairs>
  <TitlesOfParts>
    <vt:vector size="{slide_count}" baseType="lpstr">{titles}</vt:vector>
  </TitlesOfParts>
  <Company></Company>
  <LinksUpToDate>false</LinksUpToDate>
  <SharedDoc>false</SharedDoc>
  <HyperlinksChanged>false</HyperlinksChanged>
  <AppVersion>16.0000</AppVersion>
</Properties>"#
    )
}

fn slide_xml(text: &str, background_rel_id: Option<&str>) -> String {
    let escaped = xml_escape(text);
    let background_xml = if let Some(rel_id) = background_rel_id {
        format!(
            r#"<p:bg>
    <p:bgPr>
      <a:blipFill rotWithShape="1">
        <a:blip r:embed="{rel_id}"/>
        <a:stretch><a:fillRect/></a:stretch>
      </a:blipFill>
      <a:effectLst/>
    </p:bgPr>
  </p:bg>"#
        )
    } else {
        String::new()
    };
    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    {background_xml}
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="2" name="TextBox 1"/>
          <p:cNvSpPr txBox="1"/>
          <p:nvPr/>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm>
            <a:off x="685800" y="1828800"/>
            <a:ext cx="7772400" cy="1828800"/>
          </a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
          <a:noFill/>
          <a:ln><a:noFill/></a:ln>
        </p:spPr>
        <p:txBody>
          <a:bodyPr anchor="ctr" lIns="91440" tIns="45720" rIns="91440" bIns="45720"/>
          <a:lstStyle/>
          <a:p>
            <a:pPr algn="ctr"/>
            <a:r>
              <a:rPr lang="en-US" sz="3200"/>
              <a:t>{escaped}</a:t>
            </a:r>
            <a:endParaRPr lang="en-US"/>
          </a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr>
    <a:masterClrMapping/>
  </p:clrMapOvr>
</p:sld>"#
    )
}

fn slide_rels_xml(image_file_name: Option<&str>) -> String {
    let image_relationship = if let Some(file_name) = image_file_name {
        format!(
            r#"<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/{file_name}"/>"#
        )
    } else {
        String::new()
    };

    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  {image_relationship}
</Relationships>"#
    )
}

fn xml_escape(raw: &str) -> String {
    let mut escaped = String::with_capacity(raw.len() + 10);
    for c in raw.chars() {
        match c {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '"' => escaped.push_str("&quot;"),
            '\'' => escaped.push_str("&apos;"),
            // strip invalid XML 1.0 control characters
            c if c.is_control() && c != '\n' && c != '\r' && c != '\t' => {}
            c => escaped.push(c),
        }
    }
    escaped
}

const ROOT_RELS_XML: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>"#;

const SLIDE_LAYOUT_RELS_XML: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>"#;

const SLIDE_MASTER_RELS_XML: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>"#;

const SLIDE_LAYOUT_XML: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
  type="title" preserve="1">
  <p:cSld name="Title Layout">
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>"#;

const SLIDE_MASTER_XML: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst>
    <p:sldLayoutId id="2147483649" r:id="rId1"/>
  </p:sldLayoutIdLst>
  <p:txStyles>
    <p:titleStyle><a:lvl1pPr algn="ctr"/></p:titleStyle>
    <p:bodyStyle><a:lvl1pPr/></p:bodyStyle>
    <p:otherStyle><a:lvl1pPr/></p:otherStyle>
  </p:txStyles>
</p:sldMaster>"#;

const THEME_XML: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="fcore-theme">
  <a:themeElements>
    <a:clrScheme name="fcore">
      <a:dk1><a:srgbClr val="000000"/></a:dk1>
      <a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="1F2D3D"/></a:dk2>
      <a:lt2><a:srgbClr val="F2F2F2"/></a:lt2>
      <a:accent1><a:srgbClr val="2E86DE"/></a:accent1>
      <a:accent2><a:srgbClr val="E67E22"/></a:accent2>
      <a:accent3><a:srgbClr val="27AE60"/></a:accent3>
      <a:accent4><a:srgbClr val="8E44AD"/></a:accent4>
      <a:accent5><a:srgbClr val="C0392B"/></a:accent5>
      <a:accent6><a:srgbClr val="16A085"/></a:accent6>
      <a:hlink><a:srgbClr val="0000FF"/></a:hlink>
      <a:folHlink><a:srgbClr val="800080"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="fcore-fonts">
      <a:majorFont><a:latin typeface="Calibri"/></a:majorFont>
      <a:minorFont><a:latin typeface="Calibri"/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="fcore-fmt">
      <a:fillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
      </a:fillStyleLst>
      <a:lnStyleLst>
        <a:ln w="9525" cap="flat" cmpd="sng" algn="ctr">
          <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
          <a:prstDash val="solid"/>
        </a:ln>
      </a:lnStyleLst>
      <a:effectStyleLst>
        <a:effectStyle><a:effectLst/></a:effectStyle>
      </a:effectStyleLst>
      <a:bgFillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
      </a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
  <a:objectDefaults/>
  <a:extraClrSchemeLst/>
</a:theme>"#;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![load_scenario, export_pptx])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::{
        fs::{self, File},
        io::Write,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn resolve_asset_resource_key_preserves_assets_path() {
        let result = resolve_asset_resource_key("assets/bg.png").expect("must resolve");
        assert_eq!(result, "assets/bg.png");
    }

    #[test]
    fn resolve_asset_resource_key_prefixes_assets_for_relative_path() {
        let result = resolve_asset_resource_key("bg.png").expect("must resolve");
        assert_eq!(result, "assets/bg.png");
    }

    #[test]
    fn resolve_asset_resource_key_normalizes_dot_and_parent_segments() {
        let result_a = resolve_asset_resource_key("assets/./bg.png").expect("must resolve");
        assert_eq!(result_a, "assets/bg.png");

        let result_b = resolve_asset_resource_key("assets/foo/../bg.png").expect("must resolve");
        assert_eq!(result_b, "assets/bg.png");
    }

    #[test]
    fn resolve_asset_resource_key_normalizes_windows_separators() {
        let result = resolve_asset_resource_key("assets\\bg.png").expect("must resolve");
        assert_eq!(result, "assets/bg.png");
    }

    #[test]
    fn resolve_asset_resource_key_rejects_traversal() {
        assert!(resolve_asset_resource_key("../bg.png").is_err());
        assert!(resolve_asset_resource_key("assets/../../bg.png").is_err());
    }

    #[test]
    fn parse_say_slides_from_ast_tracks_background_from_asset_commands() {
        let ast = json!([
          {"op":"asset","args":{"type":"bg","src":"bg_a.png"}},
          {"op":"say","args":{"text":"Hello"}},
          {"op":"asset","args":{"type":"bg","src":"assets/./bg_b.jpg"}},
          {"op":"say","args":{"text":"World"}},
          {"op":"asset","args":{"type":"fg","src":"fg.png"}},
          {"op":"say","args":{"text":"Again"}}
        ]);

        let slides = parse_say_slides_from_ast(&ast).expect("ast must parse");
        assert_eq!(slides.len(), 3);
        assert_eq!(slides[0].text, "Hello");
        assert_eq!(slides[0].background.as_deref(), Some("assets/bg_a.png"));
        assert_eq!(slides[1].text, "World");
        assert_eq!(slides[1].background.as_deref(), Some("assets/bg_b.jpg"));
        assert_eq!(slides[2].text, "Again");
        assert_eq!(slides[2].background.as_deref(), Some("assets/bg_b.jpg"));
    }

    #[test]
    fn read_checked_resource_bytes_accepts_small_file() {
        let path = unique_temp_path("fcore-small");
        let mut file = File::create(&path).expect("create temp file");
        file.write_all(b"ok").expect("write temp file");
        drop(file);

        let result = read_checked_resource_bytes(&path);
        let _ = fs::remove_file(&path);

        let bytes = result.expect("small file should pass");
        assert_eq!(bytes, b"ok");
    }

    #[test]
    fn read_checked_resource_bytes_rejects_oversized_file() {
        let path = unique_temp_path("fcore-large");
        let file = File::create(&path).expect("create temp file");
        file.set_len(MAX_MEDIA_FILE_BYTES + 1)
            .expect("set oversized length");
        drop(file);

        let result = read_checked_resource_bytes(&path);
        let _ = fs::remove_file(&path);

        assert!(result.is_err());
    }

    fn unique_temp_path(prefix: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        std::env::temp_dir().join(format!("{prefix}-{}-{nanos}.bin", std::process::id()))
    }
}
