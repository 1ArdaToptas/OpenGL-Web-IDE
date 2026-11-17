// Derleyici iletilerinin Türkçe açıklaması. Tarayıcı modu clang, yerel mod gcc iletileri üretir;
// ikisinin en sık iletileri burada. Eşleşmeyen ileti İngilizce kalır (yanlış çeviri göstermemek için).

/** Tırnaklı ad: clang 'x', gcc 'x' veya ‘x’, bağlayıcı `x' */
const Q = String.raw`([\x60'‘][^'’]*['’])`;

type Rule = [RegExp, (...groups: string[]) => string];

const rx = (body: string) => new RegExp(`^${body}$`);

const RULES: Rule[] = [
  // Tanımsız adlar / fonksiyonlar
  [rx(`use of undeclared identifier ${Q}`), (n) => `Tanımlanmamış ad kullanıldı: ${n}`],
  [rx(`${Q} undeclared \\(first use in this function\\)`), (n) => `Tanımlanmamış ad: ${n} (bu fonksiyonda ilk kullanım)`],
  [rx(`${Q} undeclared here \\(not in a function\\)`), (n) => `Tanımlanmamış ad: ${n}`],
  [
    rx(`call to undeclared function ${Q}(?:; ISO C99 and later do not support implicit function declarations)?`),
    (n) =>
      `Bildirilmemiş fonksiyon çağrıldı: ${n} (C99 ve sonrası, bildirilmeden çağrılan fonksiyona izin vermez; başlık dosyası veya yazım hatası?)`,
  ],
  [rx(`implicit declaration of function ${Q}(?: is invalid in C99)?`), (n) => `Fonksiyon bildirilmeden kullanıldı: ${n}`],
  [rx(`unknown type name ${Q}`), (n) => `Bilinmeyen tür adı: ${n}`],
  [rx(`each undeclared identifier is reported only once for each function it appears in`),
    () => "Her tanımlanmamış ad, bulunduğu fonksiyonda yalnızca bir kez bildirilir"],

  // Sözdizimi
  [rx(`expected ${Q} after expression`), (t) => `İfadeden sonra ${t} bekleniyordu`],
  [rx(`expected ${Q} after return statement`), (t) => `return ifadesinden sonra ${t} bekleniyordu`],
  [rx(`expected ${Q} after top level declarator`), (t) => `Bildirimden sonra ${t} bekleniyordu`],
  [rx(`expected ${Q} at end of declaration`), (t) => `Bildirimin sonunda ${t} bekleniyordu`],
  [rx(`expected ${Q} before ${Q}(?: token)?`), (t, b) => `${b} öncesinde ${t} bekleniyordu`],
  [rx(`expected ${Q}`), (t) => `${t} bekleniyordu`],
  [rx(`expected expression`), () => "Burada bir ifade bekleniyordu"],
  [rx(`expected expression before ${Q}(?: token)?`), (b) => `${b} öncesinde bir ifade bekleniyordu`],
  [rx(`expected identifier or ${Q}`), (t) => `Ad veya ${t} bekleniyordu`],
  [rx(`expected identifier or ${Q} before ${Q}(?: token)?`), (t, b) => `${b} öncesinde ad veya ${t} bekleniyordu`],
  [rx(`extraneous closing brace \\(${Q}\\)`), (t) => `Fazladan kapanan parantez (${t})`],

  // Dosyalar
  [rx(`${Q} file not found`), (f) => `Dosya bulunamadı: ${f}`],
  [rx(`(.+): No such file or directory`), (f) => `Dosya bulunamadı: ${f}`],

  // Argümanlar ve türler
  [rx(`too few arguments to function call, expected (\\d+), have (\\d+)`),
    (e, h) => `Fonksiyona çok az argüman verildi (beklenen ${e}, verilen ${h})`],
  [rx(`too many arguments to function call, expected (\\d+), have (\\d+)`),
    (e, h) => `Fonksiyona çok fazla argüman verildi (beklenen ${e}, verilen ${h})`],
  [rx(`too few arguments to function ${Q}`), (n) => `Fonksiyona çok az argüman verildi: ${n}`],
  [rx(`too many arguments to function ${Q}`), (n) => `Fonksiyona çok fazla argüman verildi: ${n}`],
  [rx(`redefinition of ${Q}`), (n) => `Yeniden tanımlama: ${n} zaten tanımlı`],
  [rx(`conflicting types for ${Q}; have ${Q}`), (n, t) => `Çakışan türler: ${n} farklı türle yeniden bildirildi (şimdiki: ${t})`],
  [rx(`conflicting types for ${Q}`), (n) => `Çakışan türler: ${n} farklı türle yeniden bildirildi`],
  [rx(`${Q} redeclared as different kind of symbol`), (n) => `${n} farklı türde bir sembol olarak yeniden bildirildi`],
  [rx(`previous definition (?:of ${Q} )?(?:was|is) here`), () => "Önceki tanım burada"],
  [rx(`format specifies type ${Q} but the argument has type ${Q}`),
    (a, b) => `Biçim belirteci ${a} türü bekliyor ama argüman ${b} türünde`],

  // Uyarılar
  [rx(`unused variable ${Q}`), (n) => `Kullanılmayan değişken: ${n}`],
  [rx(`unused parameter ${Q}`), (n) => `Kullanılmayan parametre: ${n}`],
  [rx(`variable ${Q} is uninitialized when used here`), (n) => `Değişken ilk değer verilmeden kullanıldı: ${n}`],
  [rx(`non-void function does not return a value(?: in all control paths)?`),
    () => "Değer döndürmesi gereken fonksiyon değer döndürmüyor"],
  [rx(`control reaches end of non-void function`),
    () => "Değer döndürmesi gereken fonksiyonun sonuna return olmadan ulaşılıyor"],

  // Bağlama
  [rx(`undefined reference to ${Q}`), (n) => `Tanımsız başvuru (bağlama hatası): ${n} — bildirildi ama hiçbir yerde tanımlanmadı`],
  [rx(`undefined symbol: (.+)`), (n) => `Tanımsız sembol (bağlama hatası): ${n} — bildirildi ama hiçbir yerde tanımlanmadı`],
  [rx(`ld returned (\\d+) exit status`), () => "Bağlayıcı (ld) hata ile bitti (yukarıdaki bağlama hatalarına bakın)"],
  [rx(`linker command failed with exit code (\\d+).*`), () => "Bağlayıcı hata ile bitti (yukarıdaki bağlama hatalarına bakın)"],
];

const FLAG = /\s*(\[-W[^\]]+\])$/;
const HINT = new RegExp(`; did you mean ${Q}\\?$`);

/** İletinin Türkçe karşılığı; tanınmayan iletide null. */
export function translateMessage(message: string): string | null {
  let core = message.trim();
  const flag = core.match(FLAG)?.[1];
  if (flag) core = core.slice(0, core.length - core.match(FLAG)![0].length);
  const hint = core.match(HINT)?.[1];
  if (hint) core = core.slice(0, core.length - core.match(HINT)![0].length);

  for (const [re, fmt] of RULES) {
    const m = core.match(re);
    if (!m) continue;
    let text = fmt(...m.slice(1));
    if (hint) text += ` — bunu mu demek istediniz: ${hint}?`;
    if (flag) text += ` ${flag}`;
    return text;
  }
  return null;
}

/** Editör üzerine gelince gösterilen metin: Türkçe açıklama + alt satırda özgün ileti. */
export function describeTurkish(message: string): string {
  const tr = translateMessage(message);
  return tr ? `${tr}\n(${message})` : message;
}
