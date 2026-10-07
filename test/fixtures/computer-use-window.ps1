param([string]$Title, [string]$StateFile)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class TestWindow { [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int command); }'
$form = New-Object System.Windows.Forms.Form
$form.Text = $Title
$form.Width = 520
$form.Height = 260
$form.StartPosition = 'CenterScreen'
$form.TopMost = $true
$text = New-Object System.Windows.Forms.TextBox
$text.AccessibleName = 'Computer Use Text'
$text.Text = 'Computer Use Text'
$text.Location = New-Object System.Drawing.Point 24, 32
$text.Width = 450
$button = New-Object System.Windows.Forms.Button
$button.Text = 'Computer Use Verify'
$button.Location = New-Object System.Drawing.Point 24, 90
$button.Width = 200
$button.Height = 40
$label = New-Object System.Windows.Forms.Label
$label.Text = 'Waiting'
$label.Location = New-Object System.Drawing.Point 24, 150
$label.Width = 450
function WriteState {
  @{ text = $text.Text; clicked = ($label.Text -eq 'Clicked') } | ConvertTo-Json -Compress | Set-Content -LiteralPath $StateFile -Encoding UTF8
}
$text.Add_TextChanged({ WriteState })
$button.Add_Click({ $label.Text = 'Clicked'; WriteState })
$form.Controls.AddRange(@($text, $button, $label))
$form.Add_Shown({ [TestWindow]::ShowWindow($form.Handle, 5) | Out-Null; $form.Activate(); $text.Focus(); WriteState })
[System.Windows.Forms.Application]::Run($form)
$form.Dispose()
