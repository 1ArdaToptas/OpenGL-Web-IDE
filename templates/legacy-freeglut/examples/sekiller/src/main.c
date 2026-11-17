/* Legacy OpenGL (compatibility profile) statik çizim örneği: noktalar, çizgiler,
 * tel kafes çokgen ve yarı saydam dolgu. Tek tampon (GLUT_SINGLE) + glFlush. */
#include <GL/freeglut.h>
#include <stdio.h>
#include <stdlib.h>

static int test_mode = 0; /* OGLIDE_TEST_FRAMES tanımlıysa çizip merkez pikseli yazar ve çıkar */

static const float HEXAGON[6][2] = {
    {1.0f, 0.0f}, {0.5f, 0.866f}, {-0.5f, 0.866f}, {-1.0f, 0.0f}, {-0.5f, -0.866f}, {0.5f, -0.866f},
};

static void display(void)
{
    int i;
    glClear(GL_COLOR_BUFFER_BIT);
    glMatrixMode(GL_MODELVIEW);
    glLoadIdentity();

    /* Ortada dolu yeşil kare */
    glPolygonMode(GL_FRONT_AND_BACK, GL_FILL);
    glColor3f(0.2f, 0.8f, 0.3f);
    glBegin(GL_QUADS);
        glVertex2f(-0.25f, -0.25f);
        glVertex2f( 0.25f, -0.25f);
        glVertex2f( 0.25f,  0.25f);
        glVertex2f(-0.25f,  0.25f);
    glEnd();

    /* Sol üstte taşınmış ve ölçeklenmiş tel kafes altıgen */
    glPushMatrix();
    glTranslatef(-0.6f, 0.55f, 0.0f);
    glScalef(0.3f, 0.3f, 1.0f);
    glPolygonMode(GL_FRONT_AND_BACK, GL_LINE);
    glLineWidth(2.0f);
    glColor3f(1.0f, 0.8f, 0.2f);
    glBegin(GL_POLYGON);
    for (i = 0; i < 6; ++i)
        glVertex3f(HEXAGON[i][0], HEXAGON[i][1], 0.0f);
    glEnd();
    glPopMatrix();
    glPolygonMode(GL_FRONT_AND_BACK, GL_FILL);

    /* Sağ üstte noktalar */
    glPointSize(6.0f);
    glBegin(GL_POINTS);
        glColor3f(1.0f, 1.0f, 1.0f);
        glVertex2f(0.5f, 0.6f);
        glVertex2f(0.6f, 0.7f);
        glVertex2f(0.7f, 0.6f);
        glVertex2f(0.8f, 0.7f);
    glEnd();

    /* Altta yatay çizgiler */
    glLineWidth(1.0f);
    glBegin(GL_LINES);
        glColor3f(0.4f, 0.6f, 1.0f);
        glVertex3f(-0.9f, -0.6f, 0.0f); glVertex3f(0.9f, -0.6f, 0.0f);
        glVertex3f(-0.9f, -0.7f, 0.0f); glVertex3f(0.9f, -0.7f, 0.0f);
    glEnd();

    /* Sağ altta üst üste binen yarı saydam kareler */
    glEnable(GL_BLEND);
    glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    glColor4f(1.0f, 0.0f, 0.0f, 0.5f);
    glBegin(GL_QUADS);
        glVertex2f(0.40f, -0.45f); glVertex2f(0.70f, -0.45f);
        glVertex2f(0.70f, -0.15f); glVertex2f(0.40f, -0.15f);
    glEnd();
    glColor4f(0.0f, 0.0f, 1.0f, 0.5f);
    glBegin(GL_QUADS);
        glVertex2f(0.55f, -0.35f); glVertex2f(0.85f, -0.35f);
        glVertex2f(0.85f, -0.05f); glVertex2f(0.55f, -0.05f);
    glEnd();
    glDisable(GL_BLEND);

    glFlush();

    if (test_mode) {
        GLint vp[4];
        unsigned char px[3];
        glFinish();
        glGetIntegerv(GL_VIEWPORT, vp);
        glReadBuffer(GL_FRONT);
        glReadPixels(vp[2] / 2, vp[3] / 2, 1, 1, GL_RGB, GL_UNSIGNED_BYTE, px);
        printf("OGLIDE_PIXEL %d %d %d\n", px[0], px[1], px[2]);
        printf("OGLIDE_GLERROR %d\n", (int)glGetError());
        glutLeaveMainLoop();
    }
}

static void reshape(int w, int h)
{
    glViewport(0, 0, w, h);
    glMatrixMode(GL_PROJECTION);
    glLoadIdentity();
    glOrtho(-1.0, 1.0, -1.0, 1.0, -1.0, 1.0);
}

int main(int argc, char **argv)
{
    setvbuf(stdout, NULL, _IONBF, 0);
    test_mode = getenv("OGLIDE_TEST_FRAMES") != NULL;

    glutInit(&argc, argv);
    glutInitContextVersion(2, 1);
    glutInitContextProfile(GLUT_COMPATIBILITY_PROFILE);
    glutInitDisplayMode(GLUT_SINGLE | GLUT_RGBA);
    glutInitWindowSize(800, 600);
    glutCreateWindow("OpenGL Web IDE - Legacy");
    glutSetOption(GLUT_ACTION_ON_WINDOW_CLOSE, GLUT_ACTION_GLUTMAINLOOP_RETURNS);

    printf("GL_VENDOR: %s\nGL_RENDERER: %s\nGL_VERSION: %s\n",
           glGetString(GL_VENDOR), glGetString(GL_RENDERER), glGetString(GL_VERSION));

    glClearColor(0.1f, 0.1f, 0.12f, 1.0f);
    glutDisplayFunc(display);
    glutReshapeFunc(reshape);
    glutMainLoop();
    return 0;
}
