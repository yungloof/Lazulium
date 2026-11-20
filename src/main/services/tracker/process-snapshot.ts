import { ChildProcessWithoutNullStreams, spawn } from 'child_process';

export interface ProcessInfo {
  pid: number;
  ppid: number;
  path?: string;                    // Ausente para processos elevados/de sistema
  createdAt?: number;               // epoch ms (CreationDate)
}

const END_MARKER = '<<LAZULIUM_END>>';
const GAMEPAD_PREFIX = 'PAD\t';
const QUERY_TIMEOUT_MS = 10_000;

// Loop em PowerShell que responde a cada linha recebida no stdin com a lista
// de processos (pid, ppid, criação, caminho). Manter o processo vivo evita os ~300ms de
// inicialização do PowerShell a cada consulta. A lista sai direto da API do Windows
// (≈ 12ms, contra ≈ 80ms do WMI parado e segundos com o PC ocupado, como ao fechar um jogo);
// o acesso pedido é o mesmo do WMI, então os caminhos visíveis são os mesmos. Se a
// compilação falhar, volta ao Get-CimInstance.
// A linha PAD traz o contador de pacotes do XInput de cada controle: ele muda a cada
// botão/analógico, inclusive com o jogo em primeiro plano (o Windows não conta controle
// como atividade do usuário). Falhar aqui só desliga a detecção de controle.
const WORKER_SCRIPT = `
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ProgressPreference = 'SilentlyContinue'
try {
  Add-Type -TypeDefinition @"
using System.Runtime.InteropServices;
public static class LazuliumGamepad {
  [StructLayout(LayoutKind.Sequential)]
  public struct State { public uint Packet; public ushort Buttons; public byte LT; public byte RT; public short LX; public short LY; public short RX; public short RY; }
  [DllImport("xinput1_4.dll")] private static extern uint XInputGetState(uint index, out State state);
  public static string Read() {
    var result = new string[4];
    for (uint i = 0; i < 4; i++) { State s; result[i] = XInputGetState(i, out s) == 0 ? s.Packet.ToString() : "-"; }
    return string.Join(",", result);
  }
}
"@
} catch {}
$useApi = $false
try {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class LazuliumProcesses {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  private struct Entry { public uint Size; public uint Usage; public uint Pid; public IntPtr Heap; public uint Module; public uint Threads; public uint ParentPid; public int Priority; public uint Flags; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string Exe; }
  [DllImport("kernel32.dll")] private static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern bool Process32FirstW(IntPtr snapshot, ref Entry entry);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern bool Process32NextW(IntPtr snapshot, ref Entry entry);
  [DllImport("kernel32.dll")] private static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern bool QueryFullProcessImageNameW(IntPtr handle, uint flags, StringBuilder name, ref uint size);
  [DllImport("kernel32.dll")] private static extern bool GetProcessTimes(IntPtr handle, out long created, out long exited, out long kernel, out long user);
  private static string Created(uint pid) {
    IntPtr h = OpenProcess(0x1000, false, pid);
    if (h == IntPtr.Zero) return "";
    try { long c, e, k, u; return GetProcessTimes(h, out c, out e, out k, out u) && c > 0 ? ((c - 116444736000000000L) / 10000L).ToString() : ""; }
    finally { CloseHandle(h); }
  }
  private static string Path(uint pid) {
    IntPtr h = OpenProcess(0x0410, false, pid);
    if (h == IntPtr.Zero) return "";
    try { var name = new StringBuilder(1024); uint size = 1024; return QueryFullProcessImageNameW(h, 0, name, ref size) ? name.ToString() : ""; }
    finally { CloseHandle(h); }
  }
  public static string List() {
    IntPtr snapshot = CreateToolhelp32Snapshot(2, 0);
    if (snapshot == new IntPtr(-1)) throw new Exception("snapshot");
    var result = new StringBuilder();
    try {
      var entry = new Entry();
      entry.Size = (uint)Marshal.SizeOf(typeof(Entry));
      if (!Process32FirstW(snapshot, ref entry)) throw new Exception("snapshot");
      do {
        result.Append(entry.Pid).Append('\\t').Append(entry.ParentPid).Append('\\t').Append(Created(entry.Pid)).Append('\\t').Append(Path(entry.Pid)).Append('\\n');
      } while (Process32NextW(snapshot, ref entry));
    } finally { CloseHandle(snapshot); }
    return result.ToString();
  }
}
"@
  $useApi = $true
} catch {}
$epoch = [DateTime]::new(1970, 1, 1, 0, 0, 0, [DateTimeKind]::Utc)
while ($null -ne [Console]::In.ReadLine()) {
  try { [Console]::Out.WriteLine("${GAMEPAD_PREFIX.trim()}\`t" + [LazuliumGamepad]::Read()) } catch {}
  $listed = $false
  if ($useApi) {
    try { [Console]::Out.Write([LazuliumProcesses]::List()); $listed = $true } catch { $useApi = $false }
  }
  if (-not $listed) {
    foreach ($p in Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,ExecutablePath,CreationDate) {
      $created = if ($p.CreationDate) { [long]($p.CreationDate.ToUniversalTime() - $epoch).TotalMilliseconds } else { '' }
      [Console]::Out.WriteLine("$($p.ProcessId)\`t$($p.ParentProcessId)\`t$created\`t$($p.ExecutablePath)")
    }
  }
  [Console]::Out.WriteLine('${END_MARKER}')
  [Console]::Out.Flush()
}
`;

interface PendingQuery {
  resolve: (list: ProcessInfo[]) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

class ProcessSnapshotWorker {
  private child: ChildProcessWithoutNullStreams | null = null;
  private buffer = '';
  private pending: PendingQuery[] = [];
  private gamepadState?: string;
  private lastGamepadInputAt = 0;

  // epoch ms do último uso de controle XInput visto (0 = nenhum desde que o worker iniciou)
  getLastGamepadInputAt(): number {
    return this.lastGamepadInputAt;
  }

  private onGamepadState(state: string): void {
    if (this.gamepadState !== undefined && gamepadInputChanged(this.gamepadState, state)) {
      this.lastGamepadInputAt = Date.now();
    }
    this.gamepadState = state;
  }

  private ensureStarted(): ChildProcessWithoutNullStreams {
    if (this.child) return this.child;

    const encoded = Buffer.from(WORKER_SCRIPT, 'utf16le').toString('base64');
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NoLogo', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true }
    );

    // Escrever num worker que acabou de morrer dá EPIPE no stdin: sem ouvinte, viraria exceção não tratada.
    // A consulta pendente falha pelo 'exit' (ou pelo timeout) e o worker é recriado na próxima.
    child.stdin.on('error', (err) => console.warn('[ProcessSnapshot] stdin:', err.message));
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => this.onData(chunk));
    child.stderr.on('data', (chunk) => {
      const text = String(chunk).trim();
      if (text && !text.startsWith('#< CLIXML')) console.warn('[ProcessSnapshot] stderr:', text);
    });
    child.on('exit', () => {
      if (this.child === child) this.child = null;
      this.failAll(new Error('Worker de processos encerrou inesperadamente'));
    });
    child.on('error', (err) => {
      if (this.child === child) this.child = null;
      this.failAll(err);
    });

    this.child = child;
    this.buffer = '';
    return child;
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let markerIndex: number;
    while ((markerIndex = this.buffer.indexOf(END_MARKER)) >= 0) {
      const block = this.buffer.slice(0, markerIndex);
      this.buffer = this.buffer.slice(markerIndex + END_MARKER.length);
      const query = this.pending.shift();
      if (!query) continue;
      clearTimeout(query.timer);
      const padLine = block.split(/\r?\n/).find((line) => line.startsWith(GAMEPAD_PREFIX));
      if (padLine) this.onGamepadState(padLine.slice(GAMEPAD_PREFIX.length).trim());
      query.resolve(parseBlock(block));
    }
  }

  private failAll(err: Error): void {
    for (const query of this.pending.splice(0)) {
      clearTimeout(query.timer);
      query.reject(err);
    }
  }

  query(): Promise<ProcessInfo[]> {
    if (process.platform !== 'win32') return Promise.resolve([]);
    const child = this.ensureStarted();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // Worker travado: derruba para recriar na próxima consulta
        this.stop();
        reject(new Error('Timeout ao listar processos'));
      }, QUERY_TIMEOUT_MS);
      this.pending.push({ resolve, reject, timer });
      child.stdin.write('q\n');
    });
  }

  // Fecha o worker só se ninguém está esperando uma consulta (a procura de jogos abertos por fora
  // e o monitor dividem o mesmo worker)
  stopWhenIdle(): void {
    if (this.pending.length === 0) this.stop();
  }

  stop(): void {
    const child = this.child;
    this.child = null;
    this.gamepadState = undefined;
    if (child) {
      child.stdin.end();
      child.kill();
    }
    this.failAll(new Error('Worker de processos finalizado'));
  }
}

// Um controle conectado cujo contador mudou (ligar/desligar sozinho não conta como jogar)
export function gamepadInputChanged(previous: string, current: string): boolean {
  const before = previous.split(',');
  return current.split(',').some((packet, i) => packet !== '-' && before[i] !== '-' && before[i] !== undefined && packet !== before[i]);
}

function parseBlock(block: string): ProcessInfo[] {
  const list: ProcessInfo[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (!line) continue;
    const [pid, ppid, created, path] = line.split('\t');
    const pidNum = Number(pid);
    if (!Number.isFinite(pidNum)) continue;
    list.push({
      pid: pidNum,
      ppid: Number(ppid) || 0,
      createdAt: Number(created) || undefined,
      path: path?.trim() || undefined
    });
  }
  return list;
}

export const processSnapshot = new ProcessSnapshotWorker();
