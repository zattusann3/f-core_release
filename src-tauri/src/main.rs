#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{fs, path::Component};
use tauri::{path::BaseDirectory, AppHandle, Manager};

const DEFAULT_SCENARIO_RESOURCE: &str = "assets/demo_scenario.md";

#[tauri::command]
fn load_scenario(app: AppHandle, path: Option<String>) -> Result<String, String> {
    let resource_key = resolve_scenario_resource_key(path.as_deref())?;
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
            let normalized = candidate.to_string_lossy();
            Ok(format!("assets/{normalized}"))
        }
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![load_scenario])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
