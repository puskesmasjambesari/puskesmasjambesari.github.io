// GANTI DENGAN URL WORKER ANDA
const WORKER_URL = "https://gemini-proxy.sip-puskesmas-jambesari.workers.dev"; 

// GANTI DENGAN URL RAW FILE REGULASI DI GITHUB ANDA 
// (Bisa dikosongkan/di-comment sementara jika file belum ada di github)
const REGULASI_URL = "https://raw.githubusercontent.com/username/repo/main/docs/regulasi_puskesmas.txt";

// Ini adalah "otak/memori" aplikasi. Semua data akan disimpan di objek ini
// Objek inilah yang nantinya bisa di download/upload oleh user
let appState = {
    step: 1,
    dataInput: {
        dasar: "",
        kinerja: ""
    },
    acuanRegulasi: "",
    hasilAnalisisMasalah: [] // Akan berisi array object hasil Step 2
};

// Fungsi bantuan untuk menampilkan loading
function showLoading(show) {
    document.getElementById('loadingOverlay').style.display = show ? 'block' : 'none';
}

// ==========================================
// TAHAP PRE-REQUISITE: Mengambil Acuan Regulasi
// ==========================================
async function fetchRegulasi() {
    try {
        const response = await fetch(REGULASI_URL);
        if(response.ok) {
            appState.acuanRegulasi = await response.text();
            console.log("Acuan regulasi berhasil dimuat.");
        }
    } catch (e) {
        console.log("Gagal memuat regulasi, menggunakan pengetahuan bawaan AI.");
    }
}
// Panggil saat aplikasi pertama kali dimuat
fetchRegulasi();

// ==========================================
// STEP 1 -> STEP 2: Analisis Identifikasi Masalah
// ==========================================
async function prosesStep2() {
    // 1. Simpan input user ke dalam appState
    appState.dataInput.dasar = document.getElementById('inputDasar').value;
    appState.dataInput.kinerja = document.getElementById('inputKinerja').value;

    if (!appState.dataInput.kinerja) {
        alert("Data Capaian Kinerja wajib diisi!");
        return;
    }

    showLoading(true);

    // 2. Merancang Prompt yang sangat spesifik (System Prompt + JSON Enforcement)
    const promptSystem = `Anda adalah Ahli Manajemen Mutu Puskesmas. Tugas Anda melakukan identifikasi masalah berdasarkan data input.
Gunakan acuan regulasi berikut (jika ada): ${appState.acuanRegulasi.substring(0, 5000)}... 

Buatlah daftar 10 hingga 20 masalah teridentifikasi dari data kinerja.
Keluaran Anda HARUS BERUPA OBJEK JSON murni tanpa ada teks pengantar (markdown \`\`\`json diperbolehkan).
Struktur JSON yang diharapkan:
{
  "masalah": [
    {
      "id": 1,
      "deskripsi": "Kalimat masalah...",
      "bidang": "Klaster ILP / Mutu / dll",
      "rekomendasi_ai_skor": { "U": 4, "S": 3, "G": 4 },
      "alasan_rekomendasi": "Singkat saja kenapa dinilai demikian."
    }
  ]
}`;

    const promptUser = `Data Dasar: ${appState.dataInput.dasar}\n\nData Kinerja: ${appState.dataInput.kinerja}`;

    // 3. Menyiapkan payload untuk Cloudflare Worker -> Gemini API
    const requestBody = {
        contents: [
            { role: "user", parts: [{ text: promptSystem + "\n\n" + promptUser }] }
        ],
        generationConfig: {
            // Memaksa AI mengeluarkan format JSON
            responseMimeType: "application/json",
            temperature: 0.2 // Suhu rendah agar AI logis dan tidak terlalu kreatif
        }
    };

    try {
        const response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        
        // Mengambil teks jawaban dari respon Gemini
        const rawText = data.candidates[0].content.parts[0].text;
        
        // Memparsing JSON yang dihasilkan AI
        const parsedData = JSON.parse(rawText);
        
        // Menyimpan ke memori utama
        appState.hasilAnalisisMasalah = parsedData.masalah;
        appState.step = 3;

        // Render tabel ke UI
        renderTabelMasalah();
        
        // Sembunyikan Step 1, Tampilkan Step 3
        document.getElementById('step1').classList.remove('step-active');
        document.getElementById('step3').classList.add('step-active');

    } catch (error) {
        alert("Terjadi kesalahan saat menganalisis: " + error.message);
        console.error(error);
    } finally {
        showLoading(false);
    }
}

// ==========================================
// RENDER TABEL STEP 3
// ==========================================
function renderTabelMasalah() {
    let html = `<table class="table table-bordered table-hover">
        <thead class="table-dark">
            <tr>
                <th>No</th>
                <th>Bidang/Tema</th>
                <th>Deskripsi Masalah</th>
                <th>Rekomendasi AI (U-S-G)</th>
                <th>Pilih Sbg Prioritas Utama? (Maks 10)</th>
            </tr>
        </thead>
        <tbody>`;
    
    appState.hasilAnalisisMasalah.forEach((item, index) => {
        html += `
            <tr>
                <td>${index + 1}</td>
                <td>${item.bidang}</td>
                <td>${item.deskripsi}<br><small class="text-primary"><em>Alasan AI: ${item.alasan_rekomendasi}</em></small></td>
                <td>U:${item.rekomendasi_ai_skor.U} | S:${item.rekomendasi_ai_skor.S} | G:${item.rekomendasi_ai_skor.G}</td>
                <td class="text-center">
                    <input type="checkbox" class="form-check-input chk-masalah" style="transform: scale(1.5);" value="${item.id}" onchange="cekMaksimal()">
                </td>
            </tr>
        `;
    });
    
    html += `</tbody></table>`;
    document.getElementById('tabelIdentifikasiMasalah').innerHTML = html;
}

function cekMaksimal() {
    const checked = document.querySelectorAll('.chk-masalah:checked');
    if (checked.length > 10) {
        alert("Maksimal hanya 10 masalah yang bisa dipilih untuk proses USG selanjutnya.");
        event.target.checked = false;
    }
}

// ==========================================
// FITUR DOWNLOAD / UPLOAD JSON (MEMORI AI)
// ==========================================
function downloadJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appState, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "analisis_mutu_step" + appState.step + ".json");
    document.body.appendChild(downloadAnchorNode); 
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

function uploadJSON(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                appState = JSON.parse(e.target.result);
                alert("Data berhasil dipulihkan. Lanjut ke Step " + appState.step);
                // Logika untuk menampilkan Step yang sesuai berdasarkan appState.step akan ditambahkan nanti
            } catch (error) {
                alert("File JSON tidak valid.");
            }
        };
        reader.readAsText(file);
    }
}

// ==========================================
// STEP 4: MENAMPILKAN FORM INPUT USG
// ==========================================
function lanjutStep4() {
    // 1. Ambil semua checkbox yang dicentang di Step 3
    const checkedBoxes = document.querySelectorAll('.chk-masalah:checked');
    
    if (checkedBoxes.length === 0) {
        alert("Silakan pilih minimal 1 masalah!");
        return;
    }
    if (checkedBoxes.length > 10) {
        alert("Maksimal hanya 10 masalah yang bisa dipilih.");
        return;
    }

    // 2. Simpan masalah yang dipilih ke state
    appState.masalahTerpilih = Array.from(checkedBoxes).map(cb => {
        // Cari objek masalah aslinya berdasarkan ID
        return appState.hasilAnalisisMasalah.find(m => m.id == cb.value);
    });

    // 3. Render baris input USG
    let html = '';
    appState.masalahTerpilih.forEach((item) => {
        html += `
            <tr>
                <td>${item.deskripsi} <br><small class="text-muted">(${item.bidang})</small></td>
                <td><input type="number" min="1" max="5" class="form-control usg-input usg-u" data-id="${item.id}" value="${item.rekomendasi_ai_skor.U}" required></td>
                <td><input type="number" min="1" max="5" class="form-control usg-input usg-s" data-id="${item.id}" value="${item.rekomendasi_ai_skor.S}" required></td>
                <td><input type="number" min="1" max="5" class="form-control usg-input usg-g" data-id="${item.id}" value="${item.rekomendasi_ai_skor.G}" required></td>
            </tr>
        `;
    });
    
    document.getElementById('tabelInputUSG').innerHTML = html;

    // 4. Tampilkan Modal Step 4 menggunakan API Bootstrap
    const modalStep4 = new bootstrap.Modal(document.getElementById('modalStep4'));
    modalStep4.show();
    appState.step = 4;
}

// ==========================================
// STEP 5: KALKULASI USG & ANALISIS AI
// ==========================================
async function hitungUSG() {
    showLoading(true);

    // 1. Ambil nilai input dari form dan hitung totalnya
    appState.masalahTerpilih.forEach((item) => {
        const u = document.querySelector(`.usg-u[data-id="${item.id}"]`).value;
        const s = document.querySelector(`.usg-s[data-id="${item.id}"]`).value;
        const g = document.querySelector(`.usg-g[data-id="${item.id}"]`).value;
        
        item.skor_final = { U: parseInt(u), S: parseInt(s), G: parseInt(g) };
        item.total_skor = item.skor_final.U * item.skor_final.S * item.skor_final.G;
    });

    // 2. Urutkan berdasarkan total skor tertinggi (Ranking)
    appState.masalahTerpilih.sort((a, b) => b.total_skor - a.total_skor);

    // 3. Siapkan Prompt untuk AI
    const dataUntukAI = JSON.stringify(appState.masalahTerpilih.map(m => ({ id: m.id, masalah: m.deskripsi, total_skor: m.total_skor })));
    
    const promptSystem = `Anda adalah Ahli Mutu Puskesmas. Berikut adalah daftar masalah yang telah dinilai menggunakan metode USG (Urgency, Seriousness, Growth) oleh user, diurutkan dari skor tertinggi.
Berikan analisis/justifikasi profesional yang tajam (maksimal 2 kalimat) mengapa masalah tersebut layak atau kurang layak menjadi prioritas perbaikan berdasarkan skornya.
Keluaran HARUS JSON MURNI dengan format:
{
  "analisis_prioritas": [
    { "id": 1, "alasan_ai": "Skor tertinggi menunjukkan urgensi penanganan segera untuk mencegah meluasnya komplain pasien..." }
  ]
}`;

    const requestBody = {
        contents: [{ role: "user", parts: [{ text: promptSystem + "\n\nData:\n" + dataUntukAI }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
    };

    try {
        // 4. Panggil Cloudflare Worker
        const response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        const parsedData = JSON.parse(data.candidates[0].content.parts[0].text);
        
        // 5. Gabungkan alasan AI ke state kita
        appState.masalahTerpilih.forEach(item => {
            const analisis = parsedData.analisis_prioritas.find(a => a.id === item.id);
            item.analisis_akhir_ai = analisis ? analisis.alasan_ai : "Dianalisis secara matematis.";
        });

        renderTabelFinalUSG();
        
        // Tutup Modal 4, Buka Modal 5
        bootstrap.Modal.getInstance(document.getElementById('modalStep4')).hide();
        const modalStep5 = new bootstrap.Modal(document.getElementById('modalStep5'));
        modalStep5.show();
        
        appState.step = 5;

    } catch (error) {
        alert("Gagal menganalisis: " + error.message);
        console.error(error);
    } finally {
        showLoading(false);
    }
}

// ==========================================
// RENDER TABEL STEP 5 & FINALISASI TOP 3
// ==========================================
function renderTabelFinalUSG() {
    let html = '';
    appState.masalahTerpilih.forEach((item, index) => {
        html += `
            <tr>
                <td class="text-center fw-bold h5">${index + 1}</td>
                <td>${item.deskripsi}</td>
                <td class="text-center fw-bold">${item.total_skor} <br><small class="text-muted fw-normal">(U:${item.skor_final.U} S:${item.skor_final.S} G:${item.skor_final.G})</small></td>
                <td><small>${item.analisis_akhir_ai}</small></td>
                <td class="text-center">
                    <input type="checkbox" class="form-check-input chk-top3" style="transform: scale(1.5);" value="${item.id}" onchange="cekMaksimalTop3()">
                </td>
            </tr>
        `;
    });
    document.getElementById('tabelFinalUSG').innerHTML = html;
}

function cekMaksimalTop3() {
    const checked = document.querySelectorAll('.chk-top3:checked');
    if (checked.length > 3) {
        alert("Sesuai ketentuan, Anda hanya dapat memilih maksimal 3 masalah prioritas utama.");
        event.target.checked = false;
    }
}

function finalisasiUSG() {
    const checkedBoxes = document.querySelectorAll('.chk-top3:checked');
    if (checkedBoxes.length === 0) {
        alert("Pilih setidaknya 1 masalah prioritas utama!");
        return;
    }

    // Simpan prioritas final ke state
    appState.prioritasAkhir = Array.from(checkedBoxes).map(cb => {
        return appState.masalahTerpilih.find(m => m.id == cb.value);
    });

    // Tutup Modal 5
    bootstrap.Modal.getInstance(document.getElementById('modalStep5')).hide();
    
    alert("Berhasil! Masalah prioritas telah ditetapkan. Data siap untuk dianalisis menggunakan Diagram Tulang Ikan (Fishbone).");
    // Nanti akan memanggil fungsi tampilStep6() di sini
}
