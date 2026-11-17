# Legacy OpenGL (Compatibility) + FreeGLUT + GLU

## Desteklenmesi zorunlu API

`glBegin glEnd glVertex2f glVertex3f glColor3f glColor4f glClearColor glMatrixMode glLoadIdentity glTranslatef glRotatef glScalef glOrtho glLineWidth glPointSize glPolygonMode glFlush`
FreeGLUT: `glutInit glutCreateWindow glutDisplayFunc glutTimerFunc` (+ `glutInitDisplayMode glutInitWindowSize glutReshapeFunc glutKeyboardFunc glutPostRedisplay glutSwapBuffers glutMainLoop`). GLU: `gluPerspective gluLookAt gluOrtho2D`.

Bu fonksiyonlar Windows `opengl32.dll` içinde OpenGL 1.1 olarak doğrudan export edilir; loader gerekmez. `<GL/freeglut.h>` (veya `<GL/glut.h>`) `<GL/gl.h>` ve `<GL/glu.h>`'yi dahil eder.

## Context

Varsayılan FreeGLUT context'i compatibility'dir. Açıkça istemek için:
`glutInitContextVersion(2,1); glutInitContextProfile(GLUT_COMPATIBILITY_PROFILE);`
Core profile **istenmez**.

## Şablon iskeleti

```c
#include <GL/freeglut.h>
#include <stdio.h>
#ifdef _WIN32
#include <windows.h>
__declspec(dllexport) DWORD NvOptimusEnablement = 1;          /* C++'ta extern "C" */
__declspec(dllexport) int AmdPowerXpressRequestHighPerformance = 1;
#endif

static float angle = 0.0f;

static void display(void) {
    glClear(GL_COLOR_BUFFER_BIT);
    glMatrixMode(GL_MODELVIEW); glLoadIdentity();
    glRotatef(angle, 0, 0, 1);
    glBegin(GL_TRIANGLES);
      glColor3f(1,0,0); glVertex2f(-0.5f,-0.5f);
      glColor3f(0,1,0); glVertex2f( 0.5f,-0.5f);
      glColor3f(0,0,1); glVertex2f( 0.0f, 0.5f);
    glEnd();
    glutSwapBuffers();
}
static void timer(int v) {
    if (glutGetWindow() == 0) return; /* pencere kapatıldı: aksi halde freeglut exit(1) */
    angle += 1.0f; glutPostRedisplay(); glutTimerFunc(16, timer, v);
}

int main(int argc, char **argv) {
    setvbuf(stdout, NULL, _IONBF, 0);
    glutInit(&argc, argv);
    glutInitDisplayMode(GLUT_DOUBLE | GLUT_RGBA);
    glutInitWindowSize(800, 600);
    glutCreateWindow("OpenGL Web IDE");
    glutSetOption(GLUT_ACTION_ON_WINDOW_CLOSE, GLUT_ACTION_GLUTMAINLOOP_RETURNS);
    printf("GL_RENDERER: %s\nGL_VERSION: %s\n", glGetString(GL_RENDERER), glGetString(GL_VERSION));
    glClearColor(0.1f, 0.1f, 0.1f, 1.0f);
    glutDisplayFunc(display);
    glutTimerFunc(16, timer, 0);
    glutMainLoop();
    return 0;
}
```

## Notlar

- `GLUT_SINGLE` kullanan öğrenci kodu `glFlush()` ile çalışır; `GLUT_DOUBLE` ise `glutSwapBuffers()` gerekir. İkisi karıştırılırsa siyah/titreyen pencere.
- `glutTimerFunc` tek seferliktir; callback içinde yeniden kaydedilmeli.
- `glPolygonMode(GL_FRONT_AND_BACK, GL_LINE)` compatibility'de geçerli; `glLineWidth > 1` sürücüye bağlı.
- `glGetString` yalnızca `glutCreateWindow` sonrasında geçerlidir.
