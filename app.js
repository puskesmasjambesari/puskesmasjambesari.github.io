// GANTI DENGAN URL WORKER ANDA
const WORKER_URL = "https://gemini-proxy.username.workers.dev"; 

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
