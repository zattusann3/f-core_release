{{# label: start }}
{{ set: hasKey = false }}
{{ if: hasKey -> opened }}
{{ if: !hasKey -> locked }}
{{ end }}

{{# label: opened }}
Opened.
{{ jump: end_label }}
{{ end }}

{{# label: locked }}
Locked.
{{ jump: end_label }}
{{ end }}

{{# label: end_label }}
Done.
{{ end }}
