{{# label: start }}
Hello.

{{# choice}}
- Go -> end_label
- Stay -> end_label
{{ end }}

{{ end }}

{{# label: end_label }}
Bye.
{{ end }}