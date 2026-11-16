// The PowerShell program that writes a disk image to a drive. The app starts it through the normal
// Windows permission prompt (UAC), as an elevated Windows PowerShell 5.1 process, passing the whole
// script on the command line (-EncodedCommand), so there is no script file on disk that another
// program could change between the prompt and the write.
//
// What it does, in order: re-check the disk is a removable USB or SD disk and not the Windows disk,
// re-check the image file's SHA-256, clear the partition table, take the disk offline, write the image
// with unbuffered write-through I/O, read every byte back with unbuffered I/O and compare the SHA-256,
// and report progress and the final result as JSON in a file the app polls.
//
// A "test target" is a plain file instead of a drive: the same code runs, without elevation and
// without touching any disk. The app uses it only in hidden test runs.
'use strict';

const CSHARP = String.raw`
using System; using System.IO; using System.Runtime.InteropServices; using Microsoft.Win32.SafeHandles; using System.Security.Cryptography;
public static class Raw {
  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern SafeFileHandle CreateFile(string n, uint acc, uint share, IntPtr sec, uint disp, uint flags, IntPtr tpl);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool ReadFile(SafeFileHandle h, IntPtr buf, uint n, out uint got, IntPtr ov);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool WriteFile(SafeFileHandle h, IntPtr buf, uint n, out uint put, IntPtr ov);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool DeviceIoControl(SafeFileHandle h, uint code, IntPtr i, uint ni, IntPtr o, uint no, out uint ret, IntPtr ov);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool FlushFileBuffers(SafeFileHandle h);
  const uint GENERIC_READ = 0x80000000, GENERIC_WRITE = 0x40000000, SHARE_RW = 3, OPEN_EXISTING = 3, NO_BUFFERING = 0x20000000, WRITE_THROUGH = 0x80000000;
  public static SafeFileHandle Open(string path, bool write, bool unbuffered) {
    uint flags = unbuffered ? (NO_BUFFERING | WRITE_THROUGH) : 0;
    var h = CreateFile(path, write ? (GENERIC_READ | GENERIC_WRITE) : GENERIC_READ, SHARE_RW, IntPtr.Zero, OPEN_EXISTING, flags, IntPtr.Zero);
    if (h.IsInvalid) throw new IOException("Could not open " + path + " (Windows error " + Marshal.GetLastWin32Error() + ")");
    uint r; DeviceIoControl(h, 0x90083, IntPtr.Zero, 0, IntPtr.Zero, 0, out r, IntPtr.Zero); // allow I/O to the last sectors
    return h;
  }
  static IntPtr Aligned(IntPtr raw) { long a = raw.ToInt64(); return new IntPtr((a + 4095) & ~4095L); }
  // Copies the image into the target and returns the SHA-256 of the image bytes. Reports every 8 MiB through the callback.
  public static string Write(string image, long size, string target, bool unbuffered, Action<long> report) {
    int chunk = 4 * 1024 * 1024; var raw = Marshal.AllocHGlobal(chunk + 4096); var buf = Aligned(raw); var managed = new byte[chunk];
    var sha = SHA256.Create(); long done = 0, lastReport = 0;
    try {
      using (var src = new FileStream(image, FileMode.Open, FileAccess.Read, FileShare.Read, 1 << 20))
      using (var dst = Open(target, true, unbuffered)) {
        while (done < size) {
          int want = (int)Math.Min(chunk, size - done); int n = 0;
          while (n < want) { int g = src.Read(managed, n, want - n); if (g <= 0) throw new IOException("The image file ended early."); n += g; }
          sha.TransformBlock(managed, 0, n, null, 0);
          int padded = unbuffered ? ((n + 4095) / 4096) * 4096 : n;
          if (padded > n) Array.Clear(managed, n, padded - n);
          Marshal.Copy(managed, 0, buf, padded);
          uint put; if (!WriteFile(dst, buf, (uint)padded, out put, IntPtr.Zero) || put != (uint)padded) throw new IOException("Writing failed at byte " + done + " (Windows error " + Marshal.GetLastWin32Error() + ")");
          done += n; if (done - lastReport >= 8 * 1024 * 1024 || done == size) { lastReport = done; report(done); }
        }
        FlushFileBuffers(dst);
      }
    } finally { Marshal.FreeHGlobal(raw); }
    sha.TransformFinalBlock(new byte[0], 0, 0);
    return BitConverter.ToString(sha.Hash).Replace("-", "").ToLowerInvariant();
  }
  // Reads size bytes back from the target and returns their SHA-256.
  public static string ReadBack(string target, long size, bool unbuffered, Action<long> report) {
    int chunk = 4 * 1024 * 1024; var raw = Marshal.AllocHGlobal(chunk + 4096); var buf = Aligned(raw); var managed = new byte[chunk];
    var sha = SHA256.Create(); long done = 0, lastReport = 0;
    try {
      using (var src = Open(target, false, unbuffered)) {
        while (done < size) {
          int want = (int)Math.Min(chunk, size - done); int ask = unbuffered ? ((want + 4095) / 4096) * 4096 : want;
          uint got; if (!ReadFile(src, buf, (uint)ask, out got, IntPtr.Zero) || got < (uint)want) throw new IOException("Reading back failed at byte " + done + " (Windows error " + Marshal.GetLastWin32Error() + ")");
          Marshal.Copy(buf, managed, 0, want); sha.TransformBlock(managed, 0, want, null, 0);
          done += want; if (done - lastReport >= 8 * 1024 * 1024 || done == size) { lastReport = done; report(done); }
        }
      }
    } finally { Marshal.FreeHGlobal(raw); }
    sha.TransformFinalBlock(new byte[0], 0, 0);
    return BitConverter.ToString(sha.Hash).Replace("-", "").ToLowerInvariant();
  }
}
`;

const BODY = String.raw`
$ErrorActionPreference = 'Stop'
function Report([string]$state, [int]$pct, [string]$msg, [string]$sha) {
  $o = (@{ state = $state; pct = $pct; msg = $msg; sha = $sha } | ConvertTo-Json -Compress)
  for ($i = 0; $i -lt 5; $i++) { try { [IO.File]::WriteAllText($ProgressFile, $o); break } catch { Start-Sleep -Milliseconds 100 } }
}
try {
  Add-Type -TypeDefinition $CSharp -ErrorAction Stop
  if (-not (Test-Path -LiteralPath $ImagePath)) { throw 'The image file is missing.' }
  if ((Get-Item -LiteralPath $ImagePath).Length -ne $ImageSize) { throw 'The image file has the wrong size.' }
  Report 'running' 1 'Checking the image' ''
  $have = (Get-FileHash -LiteralPath $ImagePath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($have -ne $ExpectedSha) { throw 'The image file does not match its checksum.' }
  $unbuffered = $true
  if ($TargetFile -ne '') {
    $target = $TargetFile; $unbuffered = $false
    $fs = [IO.File]::Open($target, 'OpenOrCreate', 'ReadWrite'); $fs.SetLength([Math]::Max($fs.Length, $ImageSize)); $fs.Close()
  } else {
    $d = Get-Disk -Number $DiskNumber -ErrorAction Stop
    if ($d.IsSystem -or $d.IsBoot) { throw 'Disk ' + $DiskNumber + ' is the Windows disk. Nothing was written.' }
    if (@('USB', 'SD', 'MMC') -notcontains [string]$d.BusType) { throw 'Disk ' + $DiskNumber + ' is not a removable USB or SD disk. Nothing was written.' }
    if ($d.IsReadOnly) { throw 'Disk ' + $DiskNumber + ' is read-only.' }
    if ($d.Size -lt $ImageSize) { throw 'Disk ' + $DiskNumber + ' is smaller than the image.' }
    Report 'running' 3 'Clearing the disk' ''
    if ($d.PartitionStyle -ne 'RAW') { Clear-Disk -Number $DiskNumber -RemoveData -RemoveOEM -Confirm:$false -ErrorAction Stop }
    try { Set-Disk -Number $DiskNumber -IsOffline $true -ErrorAction Stop } catch { }
    $target = '\\.\PhysicalDrive' + $DiskNumber
  }
  $onWrite = [Action[long]]{ param($n) Report 'running' (5 + [int](60 * $n / $ImageSize)) 'Writing the image' '' }
  $written = [Raw]::Write($ImagePath, $ImageSize, $target, $unbuffered, $onWrite)
  Report 'running' 66 'Reading it back' ''
  $onRead = [Action[long]]{ param($n) Report 'running' (66 + [int](33 * $n / $ImageSize)) 'Reading it back' '' }
  $back = [Raw]::ReadBack($target, $ImageSize, $unbuffered, $onRead)
  if ($back -ne $ExpectedSha -or $written -ne $ExpectedSha) { throw 'The data read back from the drive does not match the image. The write is not good.' }
  Report 'done' 100 'Written and verified' $back
} catch {
  Report 'failed' 0 ([string]$_.Exception.Message) ''
  exit 1
}
`;

// Quotes a value for a PowerShell single-quoted string.
const q = (v) => "'" + String(v).replace(/'/g, "''") + "'";

// params: { diskNumber, targetFile, imagePath, imageSize, sha256, progressFile }. Returns the script text.
function buildScript(p) {
  const num = (v) => { const n = Number(v); if (!Number.isInteger(n) || n < -1) throw new Error('Bad number for the flash helper.'); return n; };
  if (!/^[0-9a-f]{64}$/.test(p.sha256)) throw new Error('Bad checksum for the flash helper.');
  const head = [
    '$DiskNumber = ' + num(p.diskNumber), '$TargetFile = ' + q(p.targetFile || ''), '$ImagePath = ' + q(p.imagePath),
    '$ImageSize = [long]' + num(p.imageSize), '$ExpectedSha = ' + q(p.sha256), '$ProgressFile = ' + q(p.progressFile),
    '$CSharp = @' + "'" + '\n' + CSHARP.trim() + '\n' + "'" + '@'
  ].join('\n');
  return head + '\n' + BODY.trim() + '\n';
}

const encode = (script) => Buffer.from(script, 'utf16le').toString('base64');

module.exports = { buildScript, encode, q };
