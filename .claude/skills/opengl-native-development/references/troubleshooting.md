# Sık Hatalar

| Belirti | Sebep | Çözüm |
|---|---|---|
| `undefined reference to glutInit` / `__imp_glut*` | link eksik/sıra yanlış | `freeglut glu32 opengl32`; statik linkte `FREEGLUT_STATIC` tanımla |
| `undefined reference to gluPerspective` | `glu32` yok | link listesine ekle |
| `GL/glut.h: No such file` | freeglut paketi yok / yanlış MSYS2 ortamı | UCRT64 paketini kur, MINGW64 ile karıştırma |
| Çalıştırınca hiçbir şey olmuyor, exit `0xC0000135` | DLL bulunamadı | PATH'e `ucrt64/bin` ekle veya statik link |
| `glfwCreateWindow` NULL | sürücü 3.3 core desteklemiyor / Basic Display Adapter / RDP | `GL_RENDERER` kontrol, GPU sürücüsü, uzak masaüstü kullanma |
| `GL_RENDERER: GDI Generic` | OpenGL 1.1 yazılım render | GPU sürücüsü eksik; legacy çalışır, modern çalışmaz |
| Yanlış GPU (iGPU) | Optimus | export sembollerini kontrol et; NVIDIA panelinde exe'yi yüksek performansa ata |
| Modern şablonda `glBegin` çökme/GL_INVALID_OPERATION | core profile'da legacy çağrı | legacy şablonu kullan |
| GLAD çağrısında segfault | `gladLoadGL` context'ten önce veya başarısız | context current → sonra yükle, dönüşü kontrol et |
| Siyah ekran, VAO'lu | VAO bağlı değil / shader link hatası / attrib location | info log'ları oku |
| Çıktı terminale gecikmeli geliyor | pipe tamponlama | `setvbuf(stdout,NULL,_IONBF,0)` veya `fflush` |
| Pencere kapanınca süreç öldürülüyor (freeglut) | varsayılan `exit()` | `GLUT_ACTION_ON_WINDOW_CLOSE` |
| Pencere X ile kapatılınca `glutPostRedisplay called with no current window`, exit 1 | bekleyen `glutTimerFunc` pencere yokken tetiklenir | timer başında `if (glutGetWindow() == 0) return;` |
| `WinMain` undefined | `-mwindows`/subsystem uyumsuz | console subsystem, `int main` |
