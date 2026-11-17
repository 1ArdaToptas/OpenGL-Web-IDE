"""Sandbox için gereken Win32 bağlamaları (ctypes). Referans: spikes/sandbox_spike.py (T1.8)."""
import ctypes
import ctypes.wintypes as wt

k32 = ctypes.WinDLL("kernel32", use_last_error=True)
adv = ctypes.WinDLL("advapi32", use_last_error=True)

JOB_OBJECT_LIMIT_ACTIVE_PROCESS = 0x8
JOB_OBJECT_LIMIT_PROCESS_MEMORY = 0x100
JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION = 0x400
JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000
JobObjectExtendedLimitInformation = 9
JobObjectAssociateCompletionPortInformation = 7
JOB_OBJECT_MSG_ACTIVE_PROCESS_LIMIT = 3
JOB_OBJECT_MSG_PROCESS_MEMORY_LIMIT = 9
JOB_OBJECT_MSG_JOB_MEMORY_LIMIT = 10
INVALID_HANDLE_VALUE = wt.HANDLE(-1)
TOKEN_ASSIGN_PRIMARY, TOKEN_DUPLICATE, TOKEN_QUERY, TOKEN_ADJUST_DEFAULT = 0x1, 0x2, 0x8, 0x80
MAXIMUM_ALLOWED = 0x02000000
SecurityImpersonation, TokenPrimary = 2, 1
TokenIntegrityLevel = 25
SE_GROUP_INTEGRITY = 0x20
LOW_INTEGRITY_SID = "S-1-16-4096"
CREATE_SUSPENDED = 0x4
CREATE_UNICODE_ENVIRONMENT = 0x400
CREATE_NO_WINDOW = 0x08000000
EXTENDED_STARTUPINFO_PRESENT = 0x80000
STARTF_USESTDHANDLES = 0x100
PROC_THREAD_ATTRIBUTE_HANDLE_LIST = 0x20002
HANDLE_FLAG_INHERIT = 0x1
WAIT_OBJECT_0, WAIT_TIMEOUT, INFINITE = 0, 0x102, 0xFFFFFFFF
INTEGRITY_NAMES = {0x0: "untrusted", 0x1000: "low", 0x2000: "medium", 0x3000: "high", 0x4000: "system"}


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


class JOBOBJECT_ASSOCIATE_COMPLETION_PORT(ctypes.Structure):
    _fields_ = [("CompletionKey", ctypes.c_void_p), ("CompletionPort", wt.HANDLE)]


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


class STARTUPINFOEXW(ctypes.Structure):
    _fields_ = [("StartupInfo", STARTUPINFOW), ("lpAttributeList", ctypes.c_void_p)]


class PROCESS_INFORMATION(ctypes.Structure):
    _fields_ = [("hProcess", wt.HANDLE), ("hThread", wt.HANDLE), ("dwProcessId", wt.DWORD),
                ("dwThreadId", wt.DWORD)]


def _sig(fn, restype, *argtypes):
    fn.restype, fn.argtypes = restype, list(argtypes)


H, D, P, B = wt.HANDLE, wt.DWORD, ctypes.c_void_p, wt.BOOL
_sig(k32.CreateJobObjectW, H, P, wt.LPCWSTR)
_sig(k32.SetInformationJobObject, B, H, ctypes.c_int, P, D)
_sig(k32.AssignProcessToJobObject, B, H, H)
_sig(k32.TerminateJobObject, B, H, wt.UINT)
_sig(k32.TerminateProcess, B, H, wt.UINT)
_sig(k32.CreateIoCompletionPort, H, H, H, ctypes.c_size_t, D)
_sig(k32.GetQueuedCompletionStatus, B, H, ctypes.POINTER(D), ctypes.POINTER(ctypes.c_size_t),
     ctypes.POINTER(ctypes.c_void_p), D)
_sig(k32.GetCurrentProcess, H)
_sig(k32.CreatePipe, B, ctypes.POINTER(H), ctypes.POINTER(H), P, D)
_sig(k32.SetHandleInformation, B, H, D, D)
_sig(k32.ReadFile, B, H, P, D, ctypes.POINTER(D), P)
_sig(k32.ResumeThread, D, H)
_sig(k32.WaitForSingleObject, D, H, D)
_sig(k32.GetExitCodeProcess, B, H, ctypes.POINTER(D))
_sig(k32.CloseHandle, B, H)
_sig(k32.InitializeProcThreadAttributeList, B, P, D, D, ctypes.POINTER(ctypes.c_size_t))
_sig(k32.UpdateProcThreadAttribute, B, P, D, ctypes.c_size_t, P, ctypes.c_size_t, P, P)
_sig(k32.DeleteProcThreadAttributeList, None, P)
_sig(adv.OpenProcessToken, B, H, D, ctypes.POINTER(H))
_sig(adv.DuplicateTokenEx, B, H, D, P, ctypes.c_int, ctypes.c_int, ctypes.POINTER(H))
_sig(adv.ConvertStringSidToSidW, B, wt.LPCWSTR, ctypes.POINTER(P))
_sig(adv.GetLengthSid, D, P)
_sig(adv.SetTokenInformation, B, H, ctypes.c_int, P, D)
_sig(adv.GetTokenInformation, B, H, ctypes.c_int, P, D, ctypes.POINTER(D))
_sig(adv.GetSidSubAuthorityCount, ctypes.POINTER(ctypes.c_ubyte), P)
_sig(adv.GetSidSubAuthority, ctypes.POINTER(D), P, D)
_sig(adv.CreateProcessAsUserW, B, H, wt.LPCWSTR, wt.LPWSTR, P, P, B, D, P, wt.LPCWSTR,
     ctypes.POINTER(STARTUPINFOEXW), ctypes.POINTER(PROCESS_INFORMATION))
k32.LocalFree.argtypes = [P]


def check(ok, what):
    if not ok:
        raise ctypes.WinError(ctypes.get_last_error(), what)
    return ok


def create_job(memory_mb: int, max_processes: int):
    job = check(k32.CreateJobObjectW(None, None), "CreateJobObject")
    info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION()
    info.BasicLimitInformation.LimitFlags = (JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_PROCESS_MEMORY
                                             | JOB_OBJECT_LIMIT_ACTIVE_PROCESS
                                             | JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION)
    info.BasicLimitInformation.ActiveProcessLimit = max_processes
    info.ProcessMemoryLimit = memory_mb * 1024 * 1024
    check(k32.SetInformationJobObject(job, JobObjectExtendedLimitInformation, ctypes.byref(info),
                                      ctypes.sizeof(info)), "SetInformationJobObject")
    return job


JobObjectBasicProcessIdList = 3
_sig(k32.QueryInformationJobObject, B, H, ctypes.c_int, P, D, ctypes.POINTER(D))


def job_process_ids(job, capacity: int = 64) -> set[int]:
    """Job'a atanmış (yaşayan) süreçlerin PID'leri."""
    class _List(ctypes.Structure):
        _fields_ = [("assigned", D), ("in_list", D), ("ids", ctypes.c_size_t * capacity)]
    info = _List()
    if not k32.QueryInformationJobObject(job, JobObjectBasicProcessIdList, ctypes.byref(info),
                                         ctypes.sizeof(info), None):
        return set()
    return {int(info.ids[i]) for i in range(info.in_list)}


def attach_completion_port(job):
    """Job limit ihlallerini (bellek, süreç sayısı) bildirecek tamamlama portu."""
    port = check(k32.CreateIoCompletionPort(INVALID_HANDLE_VALUE, None, 0, 1), "CreateIoCompletionPort")
    info = JOBOBJECT_ASSOCIATE_COMPLETION_PORT(None, port)
    check(k32.SetInformationJobObject(job, JobObjectAssociateCompletionPortInformation, ctypes.byref(info),
                                      ctypes.sizeof(info)), "SetInformationJobObject(port)")
    return port


_LIMIT_MESSAGES = {JOB_OBJECT_MSG_PROCESS_MEMORY_LIMIT: "memory", JOB_OBJECT_MSG_JOB_MEMORY_LIMIT: "memory",
                   JOB_OBJECT_MSG_ACTIVE_PROCESS_LIMIT: "processes"}


def drain_limit_violations(port) -> set[str]:
    msg, key, overlapped = wt.DWORD(), ctypes.c_size_t(), ctypes.c_void_p()
    found = set()
    while k32.GetQueuedCompletionStatus(port, ctypes.byref(msg), ctypes.byref(key), ctypes.byref(overlapped), 0):
        if msg.value in _LIMIT_MESSAGES:
            found.add(_LIMIT_MESSAGES[msg.value])
    return found


def create_primary_token(low_integrity: bool):
    cur, dup = wt.HANDLE(), wt.HANDLE()
    access = TOKEN_ASSIGN_PRIMARY | TOKEN_DUPLICATE | TOKEN_QUERY | TOKEN_ADJUST_DEFAULT
    check(adv.OpenProcessToken(k32.GetCurrentProcess(), access, ctypes.byref(cur)), "OpenProcessToken")
    try:
        check(adv.DuplicateTokenEx(cur, MAXIMUM_ALLOWED, None, SecurityImpersonation, TokenPrimary,
                                   ctypes.byref(dup)), "DuplicateTokenEx")
    finally:
        k32.CloseHandle(cur)
    if low_integrity:
        sid = ctypes.c_void_p()
        check(adv.ConvertStringSidToSidW(LOW_INTEGRITY_SID, ctypes.byref(sid)), "ConvertStringSidToSid")
        try:
            tml = TOKEN_MANDATORY_LABEL(SID_AND_ATTRIBUTES(sid, SE_GROUP_INTEGRITY))
            check(adv.SetTokenInformation(dup, TokenIntegrityLevel, ctypes.byref(tml),
                                          ctypes.sizeof(tml) + adv.GetLengthSid(sid)), "SetTokenInformation")
        finally:
            k32.LocalFree(sid)
    return dup


def process_integrity(process) -> str:
    tok, need = wt.HANDLE(), wt.DWORD()
    check(adv.OpenProcessToken(process, TOKEN_QUERY, ctypes.byref(tok)), "OpenProcessToken")
    try:
        buf = ctypes.create_string_buffer(256)
        check(adv.GetTokenInformation(tok, TokenIntegrityLevel, buf, 256, ctypes.byref(need)), "GetTokenInformation")
        sid = ctypes.cast(buf, ctypes.POINTER(TOKEN_MANDATORY_LABEL)).contents.Label.Sid
        rid = adv.GetSidSubAuthority(sid, adv.GetSidSubAuthorityCount(sid).contents.value - 1).contents.value
        return INTEGRITY_NAMES.get(rid & 0xF000, hex(rid))
    finally:
        k32.CloseHandle(tok)


def create_pipe():
    """(okuma, yazma) — yalnızca yazma ucu kalıtılabilir."""
    sa = SECURITY_ATTRIBUTES(ctypes.sizeof(SECURITY_ATTRIBUTES), None, True)
    rd, wr = wt.HANDLE(), wt.HANDLE()
    check(k32.CreatePipe(ctypes.byref(rd), ctypes.byref(wr), ctypes.byref(sa), 0), "CreatePipe")
    check(k32.SetHandleInformation(rd, HANDLE_FLAG_INHERIT, 0), "SetHandleInformation")
    return rd, wr


def create_suspended_process(token, exe: str, cmdline: str, env_block, cwd: str, stdout, stderr):
    """Yalnızca stdout/stderr tutamaçlarını kalıtan (handle list), askıda başlatılmış süreç."""
    size = ctypes.c_size_t()
    k32.InitializeProcThreadAttributeList(None, 1, 0, ctypes.byref(size))
    attr = ctypes.create_string_buffer(size.value)
    check(k32.InitializeProcThreadAttributeList(attr, 1, 0, ctypes.byref(size)), "InitializeProcThreadAttributeList")
    try:
        handles = (wt.HANDLE * 2)(stdout, stderr)
        check(k32.UpdateProcThreadAttribute(attr, 0, PROC_THREAD_ATTRIBUTE_HANDLE_LIST, handles,
                                            ctypes.sizeof(handles), None, None), "UpdateProcThreadAttribute")
        si = STARTUPINFOEXW()
        si.StartupInfo.cb = ctypes.sizeof(STARTUPINFOEXW)
        si.StartupInfo.dwFlags = STARTF_USESTDHANDLES
        si.StartupInfo.hStdOutput, si.StartupInfo.hStdError = stdout, stderr
        si.lpAttributeList = ctypes.cast(attr, ctypes.c_void_p)
        pi = PROCESS_INFORMATION()
        flags = CREATE_SUSPENDED | CREATE_UNICODE_ENVIRONMENT | CREATE_NO_WINDOW | EXTENDED_STARTUPINFO_PRESENT
        check(adv.CreateProcessAsUserW(token, exe, ctypes.create_unicode_buffer(cmdline), None, None, True, flags,
                                       env_block, cwd, ctypes.byref(si), ctypes.byref(pi)), "CreateProcessAsUser")
        return pi
    finally:
        k32.DeleteProcThreadAttributeList(attr)
