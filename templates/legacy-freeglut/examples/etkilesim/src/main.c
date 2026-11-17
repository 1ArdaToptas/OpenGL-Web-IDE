/* Legacy OpenGL etkileşim örneği: fareyle tıklanan yere taşınan, klavyeyle yönetilen dönen üçgen.
 * Tuşlar: r / g / b renk, boşluk duraklat/sürdür. Olaylar terminale de yazılır. */
#include <GL/freeglut.h>
#include <stdio.h>
#include <stdlib.h>

static float angle = 0.0f, pos_x = 0.0f, pos_y = 0.0f;
static float color[3] = {1.0f, 0.5f, 0.1f};
static int paused = 0, win_w = 800, win_h = 600;
static int test_frames = 0, frame = 0; /* OGLIDE_TEST_FRAMES > 0 ise N kare çizip çıkar */

static void display(void)
{
    glClear(GL_COLOR_BUFFER_BIT);
    glMatrixMode(GL_MODELVIEW);
    glLoadIdentity();
    glTranslatef(pos_x, pos_y, 0.0f);
    glRotatef(angle, 0.0f, 0.0f, 1.0f);
    glColor3f(color[0], color[1], color[2]);
    glBegin(GL_TRIANGLES);
        glVertex2f(-0.3f, -0.25f);
        glVertex2f( 0.3f, -0.25f);
        glVertex2f( 0.0f,  0.3f);
    glEnd();

    if (test_frames > 0 && ++frame >= test_frames) {
        GLint vp[4];
        unsigned char px[3];
        glGetIntegerv(GL_VIEWPORT, vp);
        glReadBuffer(GL_BACK);
        glReadPixels(vp[2] / 2, vp[3] / 2, 1, 1, GL_RGB, GL_UNSIGNED_BYTE, px);
        printf("OGLIDE_PIXEL %d %d %d\n", px[0], px[1], px[2]);
        printf("OGLIDE_GLERROR %d\n", (int)glGetError());
        glutLeaveMainLoop();
    }
    glutSwapBuffers();
}

static void reshape(int w, int h)
{
    win_w = w;
    win_h = h > 0 ? h : 1;
    glViewport(0, 0, w, h);
    glMatrixMode(GL_PROJECTION);
    glLoadIdentity();
    glOrtho(-1.0, 1.0, -1.0, 1.0, -1.0, 1.0);
}

static void timer(int value)
{
    if (glutGetWindow() == 0)
        return; /* pencere kapatıldı */
    if (!paused)
        angle += 2.0f;
    glutPostRedisplay();
    glutTimerFunc(16, timer, value);
}

static void keyboard(unsigned char key, int x, int y)
{
    (void)x;
    (void)y;
    printf("KEY %c\n", key);
    switch (key) {
    case 'r': color[0] = 1.0f; color[1] = 0.2f; color[2] = 0.2f; break;
    case 'g': color[0] = 0.2f; color[1] = 0.9f; color[2] = 0.3f; break;
    case 'b': color[0] = 0.3f; color[1] = 0.5f; color[2] = 1.0f; break;
    case ' ': paused = !paused; break;
    }
}

static void mouse(int button, int state, int x, int y)
{
    if (button != GLUT_LEFT_BUTTON || state != GLUT_DOWN)
        return;
    printf("CLICK %d %d\n", x, y);
    /* Pencere koordinatı (sol üst 0,0) -> glOrtho koordinatı (-1..1, y yukarı) */
    pos_x = 2.0f * (float)x / (float)win_w - 1.0f;
    pos_y = 1.0f - 2.0f * (float)y / (float)win_h;
}

int main(int argc, char **argv)
{
    const char *tf = getenv("OGLIDE_TEST_FRAMES");
    setvbuf(stdout, NULL, _IONBF, 0);
    if (tf) test_frames = atoi(tf);

    glutInit(&argc, argv);
    glutInitContextVersion(2, 1);
    glutInitContextProfile(GLUT_COMPATIBILITY_PROFILE);
    glutInitDisplayMode(GLUT_DOUBLE | GLUT_RGBA);
    glutInitWindowSize(800, 600);
    glutCreateWindow("OpenGL Web IDE - Legacy");
    glutSetOption(GLUT_ACTION_ON_WINDOW_CLOSE, GLUT_ACTION_GLUTMAINLOOP_RETURNS);

    printf("GL_VENDOR: %s\nGL_RENDERER: %s\nGL_VERSION: %s\n",
           glGetString(GL_VENDOR), glGetString(GL_RENDERER), glGetString(GL_VERSION));
    printf("Tuşlar: r/g/b renk, boşluk duraklat; tıklama üçgeni taşır.\n");

    glClearColor(0.1f, 0.1f, 0.12f, 1.0f);
    glutDisplayFunc(display);
    glutReshapeFunc(reshape);
    glutKeyboardFunc(keyboard);
    glutMouseFunc(mouse);
    glutTimerFunc(16, timer, 0);
    glutMainLoop();
    return 0;
}
