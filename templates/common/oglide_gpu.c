/* Motor tarafından her projeye eklenir: hibrit GPU sistemlerinde
 * yüksek performanslı GPU'nun (NVIDIA Optimus / AMD PowerXpress) seçilmesini ister. */
#ifdef _WIN32
#include <windows.h>
__declspec(dllexport) DWORD NvOptimusEnablement = 0x00000001;
__declspec(dllexport) int AmdPowerXpressRequestHighPerformance = 1;
#endif
