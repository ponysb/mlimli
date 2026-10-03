param([Parameter(Mandatory=$true)][string]$Directory, [ValidateSet('install', 'uninstall')][string]$Action)
$ErrorActionPreference = 'Stop'
$target = [IO.Path]::GetFullPath($Directory).TrimEnd('\')
$current = [Environment]::GetEnvironmentVariable('Path', 'User')
$entries = @()
foreach ($entry in ($current -split ';')) {
  if (!$entry) { continue }
  if ($entry.Trim().TrimEnd('\') -ieq $target) { continue }
  $entries += $entry
}
if ($Action -eq 'install') { $entries += $target }
[Environment]::SetEnvironmentVariable('Path', ($entries -join ';'), 'User')
