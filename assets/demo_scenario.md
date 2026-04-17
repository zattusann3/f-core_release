Scenario comments outside labels are ignored.

{{# label: start }}
{{ @asset type="bg" src="sample.jpg" }}
Welcome to f-core Tauri E2E.
{{ @effect type="color" targetId="fc-text-layer" value="#ffee99" }}
{{# choice}}
- Enter middle scene -> middle
- Jump to end -> end
{{ end }}
{{ end }}

{{# label: middle }}
You are now in the middle scene.
{{ @effect type="shake" targetId="fc-text-layer" value="4" }}
{{# choice}}
- Return to start -> start
- Finish story -> end
{{ end }}
{{ end }}

{{# label: end }}
{{ @effect type="shake" targetId="fc-text-layer" value="0" }}
{{ @effect type="color" targetId="fc-text-layer" value="#ffffff" }}
Done.
{{ end }}
