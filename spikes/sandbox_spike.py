"""T1.8 spike: OpenGL programı Job Object + (opsiyonel) Low Integrity Level altında çalışıyor mu?

Kullanım: python spikes/sandbox_spike.py <exe> <cwd> <msys2_bin> [--low-il] [--kill-after SANIYE]
Üretim kodu değildir; engine/sandbox (T2.6) için referans.
"""
import ctypes
import ctypes.wintypes as wt
import os
import sys
import threading
import time

k32 = ctypes.WinDLL("kernel32", use_last_error=True)
adv = ctypes.WinDLL("advapi32", use_last_error=True)

JOB_OBJECT_LIMIT_ACTIVE_PROCESS = 0x8
JOB_OBJECT_LIMIT_PROCESS_MEMORY = 0x100
JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION = 0x400
JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000
JobObjectExtendedLimitInformation = 9
TOKEN_ALL_NEEDED = 0x1 | 0x2 | 0x8 | 0x80  # ASSIGN_PRIMARY | DUPLICATE | QUERY | ADJUST_DEFAULT
TOKEN_QUERY = 0x8
MAXIMUM_ALLOWED = 0x02000000
TokenIntegrityLevel = 25
SE_GROUP_INTEGRITY = 0x20
CREATE_SUSPENDED = 0x4
CREATE_UNICODE_ENVIRONMENT = 0x400
CREATE_NO_WINDOW = 0x08000000
STARTF_USESTDHANDLES = 0x100
WAIT_OBJECT_0 = 0


class IO_COUNTERS(ctypes.Structure):
    _fields_ = [(n, ctypes.c_ulonglong) for n in (
        "ReadOperationCount", "WriteOperationCount", "OtherOperationCount",
        "ReadTransferCount", "WriteTransferCount", "OtherTransferCount")]


class JOBOBJECT_BASIC_LIMIT_INFORMATION(ctypes.Structure):
    _fields_ = [("PerProcessUserTimeLimit", ctypes.c_int64), ("PerJobUserTimeLimit", ctypes.c_int64),
                ("LimitFlags", wt.DWORD), ("MinimumWorkingSetSize", ctypes.c_size_t),
                ("MaximumWorkingSetSize", ctypes.c_size_t), ("ActiveProcessLimit", wt.DWORD),
                ("Affinity", ctypes.c_size_t), ("PriorityClass", wt.DWORD), ("SchedulingClass", wt.DWORD)]


class JOBOBJECT_EXTENDED_LIMIT_INFORMATION(ctypes.Structure):
    _fields_ = [("BasicLimitInformation", JOBOBJECT_BASIC_LIMIT_INFORMATION), ("IoInfo", IO_COUNTERS),
                ("ProcessMemoryLimit", ctypes.c_size_t), ("JobMemoryLimit", ctypes.c_size_t),
                ("PeakProcessMemoryUsed", ctypes.c_size_t), ("PeakJobMemoryUsed", ctypes.c_size_t)]


class SID_AND_ATTRIBUTES(ctypes.Structure):
    _fields_ = [("Sid", ctypes.c_void_p), ("Attributes", wt.DWORD)]


class TOKEN_MANDATORY_LABEL(ctypes.Structure):
    _fields_ = [("Label", SID_AND_ATTRIBUTES)]


class SECURITY_ATTRIBUTES(ctypes.Structure):
    _fields_ = [("nLength", wt.DWORD), ("lpSecurityDescriptor", ctypes.c_void_p), ("bInheritHandle", wt.BOOL)]


class STARTUPINFOW(ctypes.Structure):
    _fields_ = [("cb", wt.DWORD), ("lpReserved", wt.LPWSTR), ("lpDesktop", wt.LPWSTR), ("lpTitle", wt.LPWSTR),
                ("dwX", wt.DWORD), ("dwY", wt.DWORD), ("dwXSize", wt.DWORD), ("dwYSize", wt.DWORD),
                ("dwXCountChars", wt.DWORD), ("dwYCountChars", wt.DWORD), ("dwFillAttribute", wt.DWORD),
                ("dwFlags", wt.DWORD), ("wShowWindow", wt.WORD), ("cbReserved2", wt.WORD),
                ("lpReserved2", ctypes.c_void_p), ("hStdInput", wt.HANDLE), ("hStdOutput", wt.HANDLE),
                ("hStdError", wt.HANDLE)]


class PROCESS_INFORMATION(ctypes.Structure):
    _fields_ = [("hProcess", wt.HANDLE), ("hThread", wt.HANDLE), ("dwProcessId", wt.DWORD), ("dwThreadId", wt.DWORD)]


def check(ok, what):
    if not ok:
        raise ctypes.WinError(ctypes.get_last_error(), what)
    return ok


k32.CreateJobObjectW.restype = wt.HANDLE
k32.CreateJobObjectW.argtypes = [ctypes.c_void_p, wt.LPCWSTR]
k32.SetInformationJobObject.argtypes = [wt.HANDLE, ctypes.c_int, ctypes.c_void_p, wt.DWORD]
k32.AssignProcessToJobObject.argtypes = [wt.HANDLE, wt.HANDLE]
k32.GetCurrentProcess.restype = wt.HANDLE
k32.CreatePipe.argtypes = [ctypes.POINTER(wt.HANDLE), ctypes.POINTER(wt.HANDLE), ctypes.c_void_p, wt.DWORD]
k32.SetHandleInformation.argtypes = [wt.HANDLE, wt.DWORD, wt.DWORD]
k32.ReadFile.argtypes = [wt.HANDLE, ctypes.c_void_p, wt.DWORD, ctypes.POINTER(wt.DWORD), ctypes.c_void_p]
k32.ResumeThread.argtypes = [wt.HANDLE]
k32.WaitForSingleObject.argtypes = [wt.HANDLE, wt.DWORD]
k32.GetExitCodeProcess.argtypes = [wt.HANDLE, ctypes.POINTER(wt.DWORD)]
k32.CloseHandle.argtypes = [wt.HANDLE]
adv.OpenProcessToken.argtypes = [wt.HANDLE, wt.DWORD, ctypes.POINTER(wt.HANDLE)]
adv.DuplicateTokenEx.argtypes = [wt.HANDLE, wt.DWORD, ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.POINTER(wt.HANDLE)]
adv.ConvertStringSidToSidW.argtypes = [wt.LPCWSTR, ctypes.POINTER(ctypes.c_void_p)]
adv.GetLengthSid.argtypes = [ctypes.c_void_p]
adv.SetTokenInformation.argtypes = [wt.HANDLE, ctypes.c_int, ctypes.c_void_p, wt.DWORD]
adv.GetTokenInformation.argtypes = [wt.HANDLE, ctypes.c_int, ctypes.c_void_p, wt.DWORD, ctypes.POINTER(wt.DWORD)]
adv.GetSidSubAuthorityCount.restype = ctypes.POINTER(ctypes.c_ubyte)
adv.GetSidSubAuthorityCount.argtypes = [ctypes.c_void_p]
adv.GetSidSubAuthority.restype = ctypes.POINTER(wt.DWORD)
adv.GetSidSubAuthority.argtypes = [ctypes.c_void_p, wt.DWORD]
adv.CreateProcessAsUserW.argtypes = [wt.HANDLE, wt.LPCWSTR, wt.LPWSTR, ctypes.c_void_p, ctypes.c_void_p, wt.BOOL,
                                     wt.DWORD, ctypes.c_void_p, wt.LPCWSTR, ctypes.POINTER(STARTUPINFOW),
                                     ctypes.POINTER(PROCESS_INFORMATION)]


def make_job(memory_mb=512, max_procs=4):
    job = check(k32.CreateJobObjectW(None, None), "CreateJobObject")
    info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION()
    info.BasicLimitInformation.LimitFlags = (JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_PROCESS_MEMORY
                                             | JOB_OBJECT_LIMIT_ACTIVE_PROCESS
                                             | JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION)
    info.BasicLimitInformation.ActiveProcessLimit = max_procs
    info.ProcessMemoryLimit = memory_mb * 1024 * 1024
    check(k32.SetInformationJobObject(job, JobObjectExtendedLimitInformation, ctypes.byref(info),
                                      ctypes.sizeof(info)), "SetInformationJobObject")
    return job


def make_token(low_il):
    cur, dup = wt.HANDLE(), wt.HANDLE()
    check(adv.OpenProcessToken(k32.GetCurrentProcess(), TOKEN_ALL_NEEDED, ctypes.byref(cur)), "OpenProcessToken")
    check(adv.DuplicateTokenEx(cur, MAXIMUM_ALLOWED, None, 2, 1, ctypes.byref(dup)), "DuplicateTokenEx")
    k32.CloseHandle(cur)
    if low_il:
        sid = ctypes.c_void_p()
        check(adv.ConvertStringSidToSidW("S-1-16-4096", ctypes.byref(sid)), "ConvertStringSidToSid")
        tml = TOKEN_MANDATORY_LABEL(SID_AND_ATTRIBUTES(sid, SE_GROUP_INTEGRITY))
        check(adv.SetTokenInformation(dup, TokenIntegrityLevel, ctypes.byref(tml),
                                      ctypes.sizeof(tml) + adv.GetLengthSid(sid)), "SetTokenInformation")
    return dup


def integrity_rid(process):
    tok, need = wt.HANDLE(), wt.DWORD()
    check(adv.OpenProcessToken(process, TOKEN_QUERY, ctypes.byref(tok)), "OpenProcessToken(child)")
    buf = ctypes.create_string_buffer(256)
    check(adv.GetTokenInformation(tok, TokenIntegrityLevel, buf, 256, ctypes.byref(need)), "GetTokenInformation")
    sid = ctypes.cast(buf, ctypes.POINTER(TOKEN_MANDATORY_LABEL)).contents.Label.Sid
    count = adv.GetSidSubAuthorityCount(sid).contents.value
    k32.CloseHandle(tok)
    return hex(adv.GetSidSubAuthority(sid, count - 1).contents.value)  # 0x1000 Low, 0x2000 Medium


def main():
    exe, cwd, msys_bin = sys.argv[1:4]
    low_il = "--low-il" in sys.argv
    kill_after = float(sys.argv[sys.argv.index("--kill-after") + 1]) if "--kill-after" in sys.argv else None

    env = dict(os.environ)
    env["PATH"] = msys_bin + os.pathsep + env.get("PATH", "")
    if kill_after is None:
        env["OGLIDE_TEST_FRAMES"] = "10"
    env_block = ctypes.create_unicode_buffer("\0".join(f"{k}={v}" for k, v in env.items()) + "\0\0")

    sa = SECURITY_ATTRIBUTES(ctypes.sizeof(SECURITY_ATTRIBUTES), None, True)
    rd, wr = wt.HANDLE(), wt.HANDLE()
    check(k32.CreatePipe(ctypes.byref(rd), ctypes.byref(wr), ctypes.byref(sa), 0), "CreatePipe")
    check(k32.SetHandleInformation(rd, 1, 0), "SetHandleInformation")

    si = STARTUPINFOW(cb=ctypes.sizeof(STARTUPINFOW), dwFlags=STARTF_USESTDHANDLES,
                      hStdOutput=wr, hStdError=wr)
    pi = PROCESS_INFORMATION()
    job, token = make_job(), make_token(low_il)
    cmdline = ctypes.create_unicode_buffer(f'"{exe}"')
    check(adv.CreateProcessAsUserW(token, exe, cmdline, None, None, True,
                                   CREATE_SUSPENDED | CREATE_UNICODE_ENVIRONMENT | CREATE_NO_WINDOW,
                                   env_block, cwd, ctypes.byref(si), ctypes.byref(pi)), "CreateProcessAsUser")
    check(k32.AssignProcessToJobObject(job, pi.hProcess), "AssignProcessToJobObject")
    print(f"[spike] pid={pi.dwProcessId} integrity={integrity_rid(pi.hProcess)} low_il={low_il}")
    k32.ResumeThread(pi.hThread)
    k32.CloseHandle(wr)

    out = []

    def pump():
        buf, n = ctypes.create_string_buffer(4096), wt.DWORD()
        while k32.ReadFile(rd, buf, 4096, ctypes.byref(n), None) and n.value:
            out.append(buf.raw[:n.value])

    t = threading.Thread(target=pump, daemon=True)
    t.start()

    if kill_after is not None:
        time.sleep(kill_after)
        k32.CloseHandle(job)  # KILL_ON_JOB_CLOSE
        job = None
        dead = k32.WaitForSingleObject(pi.hProcess, 5000) == WAIT_OBJECT_0
        print(f"[spike] job kapatıldı -> süreç sonlandı: {dead}")
    else:
        k32.WaitForSingleObject(pi.hProcess, 20000)

    code = wt.DWORD()
    k32.GetExitCodeProcess(pi.hProcess, ctypes.byref(code))
    t.join(2)
    sys.stdout.write(b"".join(out).decode("utf-8", "replace"))
    print(f"[spike] exit=0x{code.value:08X}")
    for h in (pi.hProcess, pi.hThread, rd, token) + ((job,) if job else ()):
        k32.CloseHandle(h)


if __name__ == "__main__":
    main()
