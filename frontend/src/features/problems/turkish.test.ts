import { describe, expect, it } from "vitest";
import { describeTurkish, translateMessage } from "./turkish";

describe("translateMessage: clang (tarayıcı modu) ve gcc (yerel mod) iletileri", () => {
  it.each([
    // clang
    ["use of undeclared identifier 'x'", "Tanımlanmamış ad kullanıldı: 'x'"],
    [
      "use of undeclared identifier 'cizz'; did you mean 'ciz'?",
      "Tanımlanmamış ad kullanıldı: 'cizz' — bunu mu demek istediniz: 'ciz'?",
    ],
    [
      "call to undeclared function 'glBegn'; ISO C99 and later do not support implicit function declarations",
      "Bildirilmemiş fonksiyon çağrıldı: 'glBegn' (C99 ve sonrası, bildirilmeden çağrılan fonksiyona izin vermez; başlık dosyası veya yazım hatası?)",
    ],
    ["expected ';' after expression", "İfadeden sonra ';' bekleniyordu"],
    ["expected ';' after return statement", "return ifadesinden sonra ';' bekleniyordu"],
    ["expected ';' after top level declarator", "Bildirimden sonra ';' bekleniyordu"],
    ["expected expression", "Burada bir ifade bekleniyordu"],
    ["expected '}'", "'}' bekleniyordu"],
    ["unused variable 'a' [-Wunused-variable]", "Kullanılmayan değişken: 'a' [-Wunused-variable]"],
    ["'GL/glu2.h' file not found", "Dosya bulunamadı: 'GL/glu2.h'"],
    ["too few arguments to function call, expected 2, have 1", "Fonksiyona çok az argüman verildi (beklenen 2, verilen 1)"],
    ["too many arguments to function call, expected 0, have 1", "Fonksiyona çok fazla argüman verildi (beklenen 0, verilen 1)"],
    ["redefinition of 'ciz'", "Yeniden tanımlama: 'ciz' zaten tanımlı"],
    ["unknown type name 'Glint'", "Bilinmeyen tür adı: 'Glint'"],
    ["undefined symbol: oglide_yok", "Tanımsız sembol (bağlama hatası): oglide_yok — bildirildi ama hiçbir yerde tanımlanmadı"],
    ["non-void function does not return a value [-Wreturn-type]", "Değer döndürmesi gereken fonksiyon değer döndürmüyor [-Wreturn-type]"],
    // gcc (düz ve tipografik tırnaklarla)
    ["'x' undeclared (first use in this function)", "Tanımlanmamış ad: 'x' (bu fonksiyonda ilk kullanım)"],
    ["‘x’ undeclared (first use in this function)", "Tanımlanmamış ad: ‘x’ (bu fonksiyonda ilk kullanım)"],
    [
      "implicit declaration of function 'glBegn'; did you mean 'glBegin'? [-Wimplicit-function-declaration]",
      "Fonksiyon bildirilmeden kullanıldı: 'glBegn' — bunu mu demek istediniz: 'glBegin'? [-Wimplicit-function-declaration]",
    ],
    ["expected ';' before 'glEnd'", "'glEnd' öncesinde ';' bekleniyordu"],
    ["expected ';' before '}' token", "'}' öncesinde ';' bekleniyordu"],
    ["expected expression before ';' token", "';' öncesinde bir ifade bekleniyordu"],
    ["expected identifier or '(' before '{' token", "'{' öncesinde ad veya '(' bekleniyordu"],
    ["undefined reference to `oglide_yok'", "Tanımsız başvuru (bağlama hatası): `oglide_yok' — bildirildi ama hiçbir yerde tanımlanmadı"],
    ["too few arguments to function 'f'", "Fonksiyona çok az argüman verildi: 'f'"],
    ["GL/glu2.h: No such file or directory", "Dosya bulunamadı: GL/glu2.h"],
    ["conflicting types for 'ciz'; have 'int(void)'", "Çakışan türler: 'ciz' farklı türle yeniden bildirildi (şimdiki: 'int(void)')"],
    ["control reaches end of non-void function [-Wreturn-type]", "Değer döndürmesi gereken fonksiyonun sonuna return olmadan ulaşılıyor [-Wreturn-type]"],
    ["ld returned 1 exit status", "Bağlayıcı (ld) hata ile bitti (yukarıdaki bağlama hatalarına bakın)"],
    ["each undeclared identifier is reported only once for each function it appears in", "Her tanımlanmamış ad, bulunduğu fonksiyonda yalnızca bir kez bildirilir"],
  ])("%s", (en, tr) => {
    expect(translateMessage(en)).toBe(tr);
  });

  it("bilinmeyen ileti için null döner (özgün İngilizce gösterilir)", () => {
    expect(translateMessage("something completely new")).toBeNull();
  });
});

describe("describeTurkish", () => {
  it("Türkçe açıklama + alt satırda özgün ileti", () => {
    expect(describeTurkish("expected expression")).toBe("Burada bir ifade bekleniyordu\n(expected expression)");
  });
  it("çeviri yoksa özgün ileti olduğu gibi", () => {
    expect(describeTurkish("xyz")).toBe("xyz");
  });
});
