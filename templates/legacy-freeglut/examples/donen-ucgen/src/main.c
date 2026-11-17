/* Legacy OpenGL (compatibility profile) + FreeGLUT örneği: dönen renkli üçgen. */
#include <GL/freeglut.h>
#include <stdio.h>
#include <stdlib.h>

static float angle = 0.0f;
static int test_frames = 0; /* OGLIDE_TEST_FRAMES > 0 ise N kare çizip çıkar */
static int frame = 0;

static void report_center_pixel(void)
{
    GLint vp[4];
    unsigned char px[3];
    glGetIntegerv(GL_VIEWPORT, vp);
    glReadBuffer(GL_BACK);
    glReadPixels(vp[2] / 2, vp[3] / 2, 1, 1, GL_RGB, GL_UNSIGNED_BYTE, px);
    printf("OGLIDE_PIXEL %d %d %d\n", px[0], px[1], px[2]);
    printf("OGLIDE_GLERROR %d\n", (int)glGetError());
}

static void display(void)
{
    glClear(GL_COLOR_BUFFER_BIT);

    glMatrixMode(GL_MODELVIEW);
    glLoadIdentity();
    glRotatef(angle, 0.0f, 0.0f, 1.0f);

    glBegin(GL_TRIANGLES);
        glColor3f(1.0f, 0.0f, 0.0f); glVertex2f(-0.6f, -0.5f);
        glColor3f(0.0f, 1.0f, 0.0f); glVertex2f( 0.6f, -0.5f);
        glColor3f(0.0f, 0.0f, 1.0f); glVertex2f( 0.0f,  0.6f);
    glEnd();

    if (test_frames > 0 && ++frame >= test_frames) {
        report_center_pixel(); /* swap'tan önce: back buffer tanımlı */
        glutLeaveMainLoop();
    }
    glutSwapBuffers();
}

static void reshape(int w, int h)
{
    glViewport(0, 0, w, h);
    glMatrixMode(GL_PROJECTION);
    glLoadIdentity();
    glOrtho(-1.0, 1.0, -1.0, 1.0, -1.0, 1.0);
}

static void timer(int value)
{
    /* Pencere kapatıldıysa bekleyen zamanlayıcı yine tetiklenir; pencere yokken
       glutPostRedisplay çağrısı freeglut'ta ölümcül hatadır (exit 1). */
    if (glutGetWindow() == 0)
        return;
    angle += 1.0f;
    glutPostRedisplay();
    glutTimerFunc(16, timer, value);
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

    glClearColor(0.1f, 0.1f, 0.12f, 1.0f);
    glutDisplayFunc(display);
    glutReshapeFunc(reshape);
    glutTimerFunc(16, timer, 0);
    glutMainLoop();
    return 0;
}
