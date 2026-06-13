# Cara Menjalankan 9Router Fork (wyx0) — Manual

Tutorial ini untuk menjalankan fork 9Router yang ada di folder `D:\9Router Mod`
secara manual. Fork ini menambahkan **Kiro bulk login**, **CodeBuddy bulk login**,
**quota tracker**, dan **dashboard polish** di atas 9Router official.

> Semua command di bawah dijalankan di **PowerShell** (klik kanan Start → "Windows
> PowerShell" / "Terminal"). Bukan CMD, bukan Git Bash.

---

## PENTING: Sebelum mulai

Kamu sudah punya **9Router official** yang terinstal. Official dan fork ini:

- **Rebutan port yang sama** → `20128`
- **Pakai database yang sama** → `C:\Users\risckyaw\AppData\Roaming\9router\db\data.sqlite`

Artinya **tidak boleh jalan bersamaan**. Kalau dua-duanya nyala, yang kedua gagal
start karena port sudah dipakai. Jadi: matikan official dulu sebelum jalanin fork.

Kabar baiknya: karena DB-nya sama, **29 akun Kiro yang sudah connected tetap kebawa**
saat kamu jalanin fork ini.

---

## Langkah 1 — Matikan 9Router official

Pilih salah satu cara:

**Cara A (lewat tray icon):**
1. Lihat pojok kanan bawah taskbar (dekat jam), klik panah `^` kalau ikonnya
   tersembunyi.
2. Cari ikon **9Router**, klik kanan → **Quit** / **Exit**.

**Cara B (lewat PowerShell, kalau tray tidak ada):**
```powershell
Get-NetTCPConnection -LocalPort 20128 -State Listen | Select-Object OwningProcess
```
Catat angka `OwningProcess` (PID-nya), lalu matikan:
```powershell
Stop-Process -Id <PID> -Force
```
Ganti `<PID>` dengan angka tadi.

**Verifikasi port sudah bebas:**
```powershell
Get-NetTCPConnection -LocalPort 20128 -State Listen -ErrorAction SilentlyContinue
```
Kalau **tidak keluar apa-apa** = port bebas, lanjut. Kalau masih keluar baris,
berarti masih ada yang nyala — ulangi mematikannya.

---

## Langkah 2 — Masuk ke folder fork

```powershell
cd "D:\9Router Mod"
```

---

## Langkah 3 — Install dependency (cukup sekali)

Kalau ini pertama kali, atau setelah `git pull`:
```powershell
npm install
```
Tunggu sampai selesai (bisa 1-3 menit). Selesai kalau prompt balik ke
`PS D:\9Router Mod>`.

> Catatan: muncul `npm warn allow-scripts` itu **normal**, bukan error. Abaikan.

---

## Langkah 4 — Build (mode produksi)

```powershell
npm run build
```

Tunggu sampai muncul daftar route dan baris seperti:
```
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```
dan prompt balik tanpa pesan error merah. Build sukses.

> **Kenapa build ini aman?** Next.js versi baru di Windows sering crash saat build
> karena nyentuh folder sistem `C:\Users\...\Application Data` (folder jebakan
> bawaan Windows). Fork ini sudah dipasang wrapper (`scripts/build.mjs`) yang
> otomatis menghindari masalah itu. Jadi `npm run build` tinggal jalan, tidak perlu
> setting apa-apa.

---

## Langkah 5 — Jalankan server

```powershell
$env:PORT = "20128"
$env:HOSTNAME = "127.0.0.1"
npm run start
```

Tunggu sampai muncul:
```
✓ Ready in 0ms
- Local:   http://127.0.0.1:20128
[DB] Driver: better-sqlite3 | file: C:\Users\risckyaw\AppData\Roaming\9router\db\data.sqlite
```

**Server sudah jalan.** Jangan tutup jendela PowerShell ini — selama jendela ini
terbuka, server tetap hidup. Untuk berhenti: tekan `Ctrl + C` di jendela ini.

---

## Langkah 6 — Buka di browser & verifikasi

Buka alamat berikut di browser:

| Halaman | Alamat |
|---|---|
| Dashboard | http://localhost:20128/dashboard |
| API OpenAI-compatible | http://localhost:20128/v1 |
| Automation (bulk login) | http://localhost:20128/dashboard/automation |
| Quota Tracker | http://localhost:20128/dashboard/quota |
| Daftar Provider | http://localhost:20128/dashboard/providers |

Di halaman **Providers**, sekarang **CodeBuddy muncul** di samping Kiro AI (ikon
robot biru). Ini fitur fork — di versi official memang tidak ada.

**Tes cepat API jalan atau tidak** (buka PowerShell baru, jangan yang lagi jalanin
server):
```powershell
Invoke-RestMethod http://localhost:20128/v1/models | Select-Object -ExpandProperty data | Select-Object -First 5
```
Kalau keluar daftar model (claude-opus, kimi, dll) = API hidup dan siap dipakai.

---

## Langkah 7 — Arahkan aplikasi kamu ke fork

Endpoint OpenAI-compatible tetap sama persis seperti official:
```
http://localhost:20128/v1
```
Tinggal arahkan tool/aplikasi kamu ke situ. Tidak ada yang berubah dari sisi API.

---

## Pakai CLI (opsional)

Kalau mau pakai versi CLI:
```powershell
cd "D:\9Router Mod\cli"
npm install
npm run build
```

---

## Catatan Fitur: Kiro Bulk Login (Playwright)

Bulk login Kiro via Google butuh browser engine (Chromium). Kalau pas bulk login
muncul error soal browser, jalankan sekali ini:
```powershell
cd "D:\9Router Mod"
npx playwright install chromium
```
Setelah itu coba lagi bulk login dari halaman `/dashboard/automation`.

---

## Catatan Fitur: CodeBuddy Quota

CodeBuddy bisa chat pakai token CLI/plugin OAuth biasa. **Tapi** untuk baca angka
quota/credit, CodeBuddy butuh **web session cookie** (karena endpoint quota-nya ada
di web console `codebuddy.ai`, bukan di API plugin).

Kalau cookie kosong/expired, koneksi tetap bisa chat, cuma quota-nya nampil pesan
"butuh web session" — bukan angka palsu. Ini memang batasan dari sisi CodeBuddy,
sudah ditangani fork supaya jujur, bukan bug.

### Langkah A — Ambil cookie dari browser

1. Buka browser (Chrome/Edge), masuk ke **https://www.codebuddy.ai** lalu
   **login** pakai akun CodeBuddy yang mau dicek quota-nya.
2. Setelah login, buka halaman **https://www.codebuddy.ai/profile/usage**
   (halaman ini yang dipakai server untuk baca quota — pastikan angka quota-nya
   muncul di situ dulu, tandanya sesi login valid).
3. Tekan **F12** untuk buka Developer Tools. Pindah ke tab **Network**
   (kalau tab-nya tersembunyi, klik panah `»`).
4. Tekan **F5** (refresh halaman) supaya daftar request muncul. Di kolom filter,
   ketik `get-user-resource` untuk mempersempit.
5. Klik baris request **`get-user-resource`** yang muncul. Di panel kanan, buka
   bagian **Headers** → scroll ke **Request Headers** → cari baris **`cookie:`**.
6. Klik kanan di nilai panjang setelah `cookie:` → **Copy value**. (Kalau tidak ada
   menu itu, blok manual seluruh teks setelah `cookie: ` lalu Ctrl+C.) Ini string
   cookie yang kita butuhkan — biasanya panjang, isinya pasangan `nama=nilai`
   dipisah `;`.

> Catatan: jangan log out dari tab itu selama mau dipakai. Kalau nanti quota
> berhenti update, kemungkinan cookie sudah expired — ulangi Langkah A untuk
> ambil cookie baru.

### Langkah B — Pasang cookie ke koneksi

1. Di dashboard fork, buka **Dashboard → Providers → CodeBuddy**.
2. **Centang/pilih koneksi** CodeBuddy yang mau dipasangi cookie (boleh lebih dari
   satu sekaligus kalau cookie-nya milik akun yang sama).
3. Klik tombol **Quota Cookie**.
4. **Paste** string cookie dari Langkah A ke kolom yang tersedia, lalu **Save**.
5. Server akan langsung **probe** (tes) cookie ke CodeBuddy:
   - Kalau valid → muncul sukses + jumlah record quota yang kebaca, dan angka quota
     mulai tampil di koneksi tersebut.
   - Kalau `401/403` → cookie salah/expired, ulangi Langkah A.

> Cookie disimpan per-koneksi di field `webCookie`. Tombol **Quota Cookie** baru
> aktif setelah kamu memilih minimal satu koneksi CodeBuddy dulu — kalau di-klik
> tanpa memilih, muncul peringatan "select connection first".

---

## Troubleshooting

**"port already in use" / `EADDRINUSE` saat `npm run start`**
→ Masih ada 9Router lain (official atau fork lama) yang nyala. Balik ke **Langkah 1**,
matikan dulu, baru start lagi.

**Halaman `/dashboard` langsung redirect ke login**
→ Normal. Itu memang minta login dulu. Bukan error.

**`npm run build` error merah soal `Application Data` / `EPERM`**
→ Harusnya tidak terjadi karena sudah ada wrapper. Tapi kalau muncul, pastikan kamu
jalanin `npm run build` (bukan `npm run build:raw`). `build:raw` itu versi mentah yang
sengaja disimpan untuk Linux/server, jangan dipakai di Windows.

**Server jalan tapi browser bilang "can't reach"**
→ Pastikan jendela PowerShell yang jalanin server masih terbuka dan belum di-`Ctrl+C`.
Cek juga alamatnya `localhost:20128` (bukan port lain).

**Mau ganti port** (misal biar bisa jalan barengan official — TIDAK disarankan karena
DB tetap rebutan)
→ Ganti angka di `$env:PORT = "20128"` jadi port lain, misal `"20129"`.

---

## Cara Balik ke Official

Tinggal `Ctrl + C` di jendela server fork, lalu buka lagi aplikasi 9Router official
seperti biasa. Karena DB-nya sama, data tetap utuh.

---

## Ringkasan Command (copy-paste cepat)

```powershell
# 1. Pastikan official mati & port bebas
Get-NetTCPConnection -LocalPort 20128 -State Listen -ErrorAction SilentlyContinue

# 2. Masuk folder + build
cd "D:\9Router Mod"
npm run build

# 3. Jalankan
$env:PORT = "20128"
$env:HOSTNAME = "127.0.0.1"
npm run start
```

Buka: http://localhost:20128/dashboard
