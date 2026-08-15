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
    mulaiStep6()
}

// ==========================================
// STEP 6: ANALISIS FISHBONE & 5 WHY OLEH AI
// ==========================================
// Panggil fungsi ini di akhir fungsi finalisasiUSG() (Ganti // Nanti akan memanggil fungsi tampilStep6() di sini)
async function mulaiStep6() {
    showLoading(true);

    const dataMasalah = JSON.stringify(appState.prioritasAkhir.map(m => ({ id: m.id, masalah: m.deskripsi })));
    
    // Prompt yang sangat kuat untuk memaksa AI melakukan 5-Why
    const promptSystem = `Anda adalah Ahli Analisis Mutu (Root Cause Analysis). 
Lakukan analisis Tulang Ikan (Fishbone 5M+1E: Man, Machine, Method, Material, Measurement, Environment) dan 5-Why untuk setiap masalah berikut.
Untuk setiap masalah, hasilkan 5 hingga 10 rantai penyebab.
Keluaran HARUS JSON MURNI dengan format array berikut:
{
  "analisis_akar": [
    {
      "id_masalah": 1,
      "kategori_fishbone": "Man (Manusia)",
      "why_1": "Kinerja petugas lambat",
      "why_2": "Sering kebingungan saat input data",
      "why_3": "Tidak paham menggunakan aplikasi baru",
      "why_4": "Belum ada sosialisasi aplikasi",
      "why_5": "SOP pelatihan tidak berjalan (Ini Akar Penyebabnya)"
    }
  ]
}`;

    const requestBody = {
        contents: [{ role: "user", parts: [{ text: promptSystem + "\n\nMasalah:\n" + dataMasalah }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.3 }
    };

    try {
        const response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        const parsedData = JSON.parse(data.candidates[0].content.parts[0].text);
        
        // Simpan ke state
        appState.akarPenyebabMentah = parsedData.analisis_akar;
        
        // Berikan ID unik untuk setiap akar penyebab
        appState.akarPenyebabMentah.forEach((akar, idx) => akar.id_akar = "akar_" + idx);

        renderTabel5Why();
        
        const modalStep6A = new bootstrap.Modal(document.getElementById('modalStep6A'));
        modalStep6A.show();
        appState.step = 6;

    } catch (error) {
        alert("Gagal melakukan analisis akar penyebab: " + error.message);
    } finally {
        showLoading(false);
    }
}

// ==========================================
// RENDER TABEL 5-WHY
// ==========================================
function renderTabel5Why() {
    let html = '';
    
    // Kelompokkan berdasarkan masalah
    appState.prioritasAkhir.forEach(masalah => {
        const akarTerkait = appState.akarPenyebabMentah.filter(a => a.id_masalah == masalah.id);
        
        html += `<h5 class="mt-4 text-primary">Masalah: ${masalah.deskripsi}</h5>`;
        html += `<div class="table-responsive"><table class="table table-bordered table-hover table-sm">
                    <thead class="table-dark">
                        <tr>
                            <th>Kategori (Fishbone)</th>
                            <th>Why 1</th><th>Why 2</th><th>Why 3</th><th>Why 4</th>
                            <th class="bg-danger text-white">Why 5 (Akar Utama)</th>
                            <th>Pilih?</th>
                        </tr>
                    </thead>
                    <tbody>`;
        
        akarTerkait.forEach(akar => {
            html += `
                <tr>
                    <td><strong>${akar.kategori_fishbone}</strong></td>
                    <td>${akar.why_1}</td>
                    <td>${akar.why_2}</td>
                    <td>${akar.why_3}</td>
                    <td>${akar.why_4}</td>
                    <td class="table-danger fw-bold text-danger">${akar.why_5}</td>
                    <td class="text-center">
                        <input type="checkbox" class="form-check-input chk-akar" style="transform: scale(1.5);" value="${akar.id_akar}">
                    </td>
                </tr>
            `;
        });
        html += `</tbody></table></div>`;
    });
    
    document.getElementById('container5Why').innerHTML = html;
}

// ==========================================
// SUBMIT 5-WHY & TAMPILKAN FISHBONE
// ==========================================
function submitAkarPenyebab() {
    const checkedBoxes = document.querySelectorAll('.chk-akar:checked');
    if (checkedBoxes.length === 0) {
        alert("Pilih minimal 1 akar penyebab yang paling relevan!");
        return;
    }

    // Simpan pilihan user, buang duplikasi (jika teks why_5 sama)
    const akarTerpilih = [];
    const seenWhy5 = new Set();
    
    Array.from(checkedBoxes).forEach(cb => {
        const akar = appState.akarPenyebabMentah.find(a => a.id_akar === cb.value);
        if(!seenWhy5.has(akar.why_5.toLowerCase())) {
            seenWhy5.add(akar.why_5.toLowerCase());
            akarTerpilih.push(akar);
        }
    });

    appState.akarTerpilih = akarTerpilih;

    // Render Visualisasi Pseudo-Fishbone
    let fishboneHtml = '<ul class="list-group">';
    akarTerpilih.forEach(akar => {
        // Duri paling kecil (Why 5) ditandai khusus
        fishboneHtml += `
            <li class="list-group-item">
                <span class="badge bg-secondary">${akar.kategori_fishbone}</span> 
                ➔ ${akar.why_1} ➔ ... ➔ 
                <span class="badge bg-danger fs-6">${akar.why_5}</span>
            </li>`;
    });
    fishboneHtml += '</ul>';
    
    document.getElementById('containerFishbone').innerHTML = fishboneHtml;

    // Pindah Modal
    bootstrap.Modal.getInstance(document.getElementById('modalStep6A')).hide();
    const modalStep6B = new bootstrap.Modal(document.getElementById('modalStep6B'));
    modalStep6B.show();
}

// ==========================================
// LOGIKA NGT (Nominal Group Technique)
// ==========================================
function toggleNGTForm() {
    const opsi = document.getElementById('opsiPakaiNGT').value;
    document.getElementById('formNGTSetup').style.display = (opsi === 'ya') ? 'block' : 'none';
}

function prosesKeputusanNGT() {
    const pakaiNGT = document.getElementById('opsiPakaiNGT').value;
    
    bootstrap.Modal.getInstance(document.getElementById('modalStep6B')).hide();

    if (pakaiNGT === 'tidak') {
        appState.akarPrioritasFinal = appState.akarTerpilih;
        alert("Lanjut ke Step 7: Alternatif Solusi (Tanpa NGT).");
        // panggil fungsi mulaiStep7() disini nanti
        mulaiStep7()
    } else {
        appState.configNGT = {
            voter: parseInt(document.getElementById('jumlahVoter').value),
            metode: document.getElementById('metodeNGT').value
        };
        renderTabelVotingNGT();
    }
}

function renderTabelVotingNGT() {
    // Render Header Voter
    let headHtml = `<tr><th width="40%">Akar Penyebab (Why 5)</th>`;
    for(let i = 1; i <= appState.configNGT.voter; i++) {
        headHtml += `<th>Voter ${i}<br><input type="text" class="form-control form-control-sm" placeholder="Nama..." id="namaVoter${i}"></th>`;
    }
    headHtml += `</tr>`;
    document.getElementById('theadVotingNGT').innerHTML = headHtml;

    // Render Baris Akar Penyebab
    let bodyHtml = '';
    appState.akarTerpilih.forEach((akar) => {
        bodyHtml += `<tr><td class="fw-bold">${akar.why_5}</td>`;
        for(let i = 1; i <= appState.configNGT.voter; i++) {
            // Nilai maksimal 10
            bodyHtml += `<td><input type="number" min="1" max="10" class="form-control vote-input" data-akar="${akar.id_akar}" data-voter="${i}"></td>`;
        }
        bodyHtml += `</tr>`;
    });
    document.getElementById('tbodyVotingNGT').innerHTML = bodyHtml;

    const modalStep6C = new bootstrap.Modal(document.getElementById('modalStep6C'));
    modalStep6C.show();
}

async function kalkulasiVotingNGT() {
    // 1. Hitung total skor voting secara matematis di JavaScript (Lebih akurat dari AI)
    appState.akarTerpilih.forEach(akar => {
        let totalVote = 0;
        for(let i = 1; i <= appState.configNGT.voter; i++) {
            const val = document.querySelector(`.vote-input[data-akar="${akar.id_akar}"][data-voter="${i}"]`).value;
            totalVote += val ? parseInt(val) : 0;
        }
        akar.total_vote = totalVote;
    });

    // Urutkan dari skor tertinggi
    appState.akarTerpilih.sort((a, b) => b.total_vote - a.total_vote);

    // 2. Terapkan Filter Metode NGT
    const jumlahAkar = appState.akarTerpilih.length;
    const metode = appState.configNGT.metode;
    let jumlahDiambil = jumlahAkar; // Default ambil semua

    if (metode === 'setengah_n') jumlahDiambil = Math.ceil(jumlahAkar / 2);
    else if (metode === 'setengah_n_plus_1') jumlahDiambil = Math.ceil(jumlahAkar / 2) + 1;
    else if (metode === 'top_20') Math.max(1, Math.ceil(jumlahAkar * 0.20));
    else if (metode === 'top_10') Math.max(1, Math.ceil(jumlahAkar * 0.10));
    else if (metode === 'top_1') jumlahDiambil = 1;

    appState.akarPrioritasFinal = appState.akarTerpilih.slice(0, jumlahDiambil);

    // 3. (Opsional) Kirim ke AI untuk membuat narasi kesimpulan NGT
    showLoading(true);
    const promptSystem = `Anda adalah Ahli Fasilitator NGT. 
Berikut adalah hasil voting NGT untuk akar penyebab masalah. Akar penyebab yang terpilih (berdasarkan pemotongan metode) adalah:
${JSON.stringify(appState.akarPrioritasFinal.map(a => a.why_5 + " (Skor: " + a.total_vote + ")"))}
Buatkan narasi kesimpulan singkat 2 paragraf. 
Keluaran HARUS JSON: { "kesimpulan_ngt": "Teks narasi..." }`;

    try {
        const response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: promptSystem }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });
        
        const data = await response.json();
        const parsed = JSON.parse(data.candidates[0].content.parts[0].text);
        appState.narasiNGT = parsed.kesimpulan_ngt;

        bootstrap.Modal.getInstance(document.getElementById('modalStep6C')).hide();
        alert("Voting Selesai!\n" + appState.narasiNGT + "\n\nLanjut ke Step 7: Alternatif Solusi.");
        // panggil fungsi mulaiStep7() disini nanti
        mulaiStep7()

    } catch (error) {
        alert("Gagal memproses AI narasi NGT, namun kalkulasi berhasil.");
    } finally {
        showLoading(false);
    }
}

// ==========================================
// STEP 7: ANALISIS ALTERNATIF SOLUSI
// ==========================================
async function mulaiStep7() {
    showLoading(true);

    const akarData = JSON.stringify(appState.akarPrioritasFinal.map(a => ({ id: a.id_akar, akar_penyebab: a.why_5, kategori: a.kategori_fishbone })));

    const promptSystem = `Anda adalah Spesialis Inovasi dan Manajemen Mutu Kesehatan Publik (Puskesmas).
Berdasarkan akar masalah (Why-5) yang ada, rumuskan 2 hingga 5 alternatif solusi konkret, realistis, dan sesuai standar regulasi Kemenkes terbaru.
Keluaran HARUS JSON MURNI:
{
  "alternatif_solusi": [
    {
      "id_solusi": "sol_1",
      "id_akar": "id_akar_terkait",
      "akar_penyebab": "Teks akar penyebab...",
      "judul_solusi": "Nama Inovasi / Solusi",
      "deskripsi_solusi": "Rincian singkat solusi...",
      "kategori_kegiatan": "Manajemen / Pelatihan / Sarpras / Pelayanan"
    }
  ]
}`;

    try {
        const response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: promptSystem + "\n\nData Akar Masalah:\n" + akarData }] }],
                generationConfig: { responseMimeType: "application/json", temperature: 0.3 }
            })
        });

        const data = await response.json();
        const parsed = JSON.parse(data.candidates[0].content.parts[0].text);
        
        appState.alternatifSolusiMentah = parsed.alternatif_solusi;

        renderStep7();

        const modalStep7 = new bootstrap.Modal(document.getElementById('modalStep7'));
        modalStep7.show();
        appState.step = 7;

    } catch (error) {
        alert("Gagal merumuskan alternatif solusi: " + error.message);
    } finally {
        showLoading(false);
    }
}

function renderStep7() {
    let html = '';
    
    // Kelompokkan solusi berdasarkan Akar Penyebab
    appState.akarPrioritasFinal.forEach(akar => {
        const solusiTerkait = appState.alternatifSolusiMentah.filter(s => s.akar_penyebab === akar.why_5 || s.id_akar === akar.id_akar);

        html += `<div class="card mb-3 border-primary">
                    <div class="card-header bg-primary text-white">
                        <strong>Akar Penyebab:</strong> ${akar.why_5} <span class="badge bg-light text-dark ms-2">${akar.kategori_fishbone}</span>
                    </div>
                    <div class="card-body p-0">
                        <table class="table table-hover mb-0">
                            <thead class="table-light">
                                <tr>
                                    <th width="5%" class="text-center">Pilih</th>
                                    <th width="25%">Nama Solusi / Inovasi</th>
                                    <th>Deskripsi Pelaksanaan Solusi</th>
                                    <th width="15%">Kategori</th>
                                </tr>
                            </thead>
                            <tbody>`;

        solusiTerkait.forEach(sol => {
            html += `
                <tr>
                    <td class="text-center align-middle">
                        <input type="checkbox" class="form-check-input chk-solusi" style="transform: scale(1.4);" value="${sol.id_solusi}">
                    </td>
                    <td class="fw-bold align-middle">${sol.judul_solusi}</td>
                    <td class="align-middle">${sol.deskripsi_solusi}</td>
                    <td class="align-middle"><span class="badge bg-info text-dark">${sol.kategori_kegiatan}</span></td>
                </tr>
            `;
        });

        html += `</tbody></table></div></div>`;
    });

    document.getElementById('containerStep7').innerHTML = html;
}

function submitStep7() {
    const checked = document.querySelectorAll('.chk-solusi:checked');
    if (checked.length === 0) {
        alert("Pilih minimal 1 solusi yang akan dilaksanakan!");
        return;
    }

    appState.solusiTerpilih = Array.from(checked).map(cb => {
        return appState.alternatifSolusiMentah.find(s => s.id_solusi === cb.value);
    });

    bootstrap.Modal.getInstance(document.getElementById('modalStep7')).hide();
    
    // Langsung jalankan penyusunan Planning (Step 8)
    mulaiStep8();
}

// ==========================================
// STEP 8: PLANNING 4W + 1H & USER RECOMENDATION
// ==========================================
async function mulaiStep8() {
    showLoading(true);

    const solusiData = JSON.stringify(appState.solusiTerpilih);

    const promptSystem = `Anda adalah Perencana Mutu Operasional Puskesmas.
Berdasarkan solusi terpilih berikut, susun Rencana Pelaksanaan Kegiatan dengan format 4W + 1H (What, Why, Where, When, Who, How). Setiap solusi dapat diturunkan menjadi 1 hingga 3 rencana aksi konkret.
Keluaran HARUS JSON MURNI:
{
  "planning": [
    {
      "id_plan": "plan_1",
      "id_solusi": "id_solusi_terkait",
      "what": "Nama kegiatan spesifik...",
      "why": "Tujuan dan manfaat kegiatan...",
      "where": "Lokasi pelaksanaan (misal: Ruang Pendaftaran / Posyandu)",
      "when": "Estimasi waktu/durasi (misal: Minggu ke-2 Bulan Maret 2026)",
      "who": "Penanggung Jawab (misal: Penanggung Jawab Mutu / PJ UKP)",
      "how": "Langkah-langkah teknis pelaksanaan..."
    }
  ]
}`;

    try {
        const response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: promptSystem + "\n\nSolusi Terpilih:\n" + solusiData }] }],
                generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
            })
        });

        const data = await response.json();
        const parsed = JSON.parse(data.candidates[0].content.parts[0].text);
        
        appState.planningMentah = parsed.planning;

        renderStep8();

        const modalStep8 = new bootstrap.Modal(document.getElementById('modalStep8'));
        modalStep8.show();
        appState.step = 8;

    } catch (error) {
        alert("Gagal menyusun 4W1H: " + error.message);
    } finally {
        showLoading(false);
    }
}

function renderStep8() {
    let html = '';
    
    appState.planningMentah.forEach((plan, idx) => {
        html += `
            <tr>
                <td class="text-center">
                    <input type="checkbox" class="form-check-input chk-plan" style="transform: scale(1.3);" value="${plan.id_plan}" checked>
                </td>
                <td><strong>${plan.what}</strong></td>
                <td><small>${plan.why}</small></td>
                <td><input type="text" class="form-control form-control-sm input-where" data-id="${plan.id_plan}" value="${plan.where}"></td>
                <td><input type="text" class="form-control form-control-sm input-when" data-id="${plan.id_plan}" value="${plan.when}"></td>
                <td><input type="text" class="form-control form-control-sm input-who" data-id="${plan.id_plan}" value="${plan.who}"></td>
                <td><small>${plan.how}</small></td>
                <td>
                    <textarea class="form-control form-control-sm input-rekomendasi" data-id="${plan.id_plan}" rows="2" placeholder="Catatan/Rekomendasi user..."></textarea>
                </td>
            </tr>
        `;
    });

    document.getElementById('tbodyStep8').innerHTML = html;
}

async function submitRevisiStep8() {
    const checked = document.querySelectorAll('.chk-plan:checked');
    if (checked.length === 0) {
        alert("Pilih minimal 1 rencana aksi!");
        return;
    }

    // Capture perubahan dari input user (When, Who, Where, & Rekomendasi)
    const planningDitinjau = Array.from(checked).map(cb => {
        const id = cb.value;
        const asal = appState.planningMentah.find(p => p.id_plan === id);
        
        return {
            ...asal,
            where: document.querySelector(`.input-where[data-id="${id}"]`).value,
            when: document.querySelector(`.input-when[data-id="${id}"]`).value,
            who: document.querySelector(`.input-who[data-id="${id}"]`).value,
            rekomendasi_user: document.querySelector(`.input-rekomendasi[data-id="${id}"]`).value
        };
    });

    // Cek apakah ada rekomendasi dari user yang memerlukan revisi AI
    const adaRekomendasiUser = planningDitinjau.some(p => p.rekomendasi_user && p.rekomendasi_user.trim() !== "");

    if (adaRekomendasiUser) {
        showLoading(true);
        // Minta AI melakukan revisi narasi berdasarkan rekomendasi user
        const promptSystem = `Anda adalah Konsultan Mutu Puskesmas.
User telah memberikan penyesuaian/rekomendasi pada beberapa poin rencana aksi (4W1H). 
Tugas Anda adalah memperbarui kolom 'how' (cara pelaksanaan) dan 'why' (alasan) agar selaras dengan rekomendasi dari user tersebut.
Keluaran HARUS JSON MURNI dengan struktur array sama seperti input:
{
  "planning_revisi": [
    {
      "id_plan": "plan_1",
      "what": "...", "why": "...", "where": "...", "when": "...", "who": "...", "how": "Hasil revisi mengintegrasikan rekomendasi user...", "catatan_revisi_ai": "Integrasi rekomendasi berhasil"
    }
  ]
}`;

        try {
            const response = await fetch(WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: "user", parts: [{ text: promptSystem + "\n\nData Perencanaan + Rekomendasi User:\n" + JSON.stringify(planningDitinjau) }] }],
                    generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
                })
            });

            const data = await response.json();
            const parsed = JSON.parse(data.candidates[0].content.parts[0].text);
            appState.planningFinal = parsed.planning_revisi;

        } catch (e) {
            console.error(e);
            appState.planningFinal = planningDitinjau; // Fallback jika API gagal
        } finally {
            showLoading(false);
        }
    } else {
        appState.planningFinal = planningDitinjau;
    }

    bootstrap.Modal.getInstance(document.getElementById('modalStep8')).hide();
    alert("Rencana Aksi (4W1H) Berhasil Disusun & Direvisi!\nLanjut ke Step 9: Penganggaran & Perencanaan Anggaran.");
    // Nanti memanggil fungsi mulaiStep9() di sini
    mulaiStep9()
}

// ==========================================
// STEP 9: PENYUSUNAN ANGGARAN
// ==========================================
// (Panggil fungsi ini di dalam submitRevisiStep8() setelah alert "Berhasil!")
function mulaiStep9() {
    let html = '';
    
    appState.planningFinal.forEach(plan => {
        html += `
            <tr>
                <td><strong>${plan.what}</strong></td>
                <td><input type="text" class="form-control bg-tahun" data-id="${plan.id_plan}" placeholder="Misal: 2026"></td>
                <td><input type="text" class="form-control bg-jumlah" data-id="${plan.id_plan}" placeholder="Rp 0"></td>
                <td><input type="text" class="form-control bg-sumber" data-id="${plan.id_plan}" placeholder="BOK/JKN/BLUD/-"></td>
                <td><input type="text" class="form-control bg-catatan" data-id="${plan.id_plan}" placeholder="Integrasi UKM..."></td>
            </tr>
        `;
    });

    document.getElementById('tbodyStep9').innerHTML = html;
    
    const modalStep9 = new bootstrap.Modal(document.getElementById('modalStep9'));
    modalStep9.show();
    appState.step = 9;
}

function submitStep9() {
    // Simpan input anggaran ke dalam state
    appState.planningFinal = appState.planningFinal.map(plan => {
        return {
            ...plan,
            anggaran: {
                tahun: document.querySelector(`.bg-tahun[data-id="${plan.id_plan}"]`).value,
                jumlah: document.querySelector(`.bg-jumlah[data-id="${plan.id_plan}"]`).value,
                sumber: document.querySelector(`.bg-sumber[data-id="${plan.id_plan}"]`).value,
                catatan: document.querySelector(`.bg-catatan[data-id="${plan.id_plan}"]`).value
            }
        };
    });

    bootstrap.Modal.getInstance(document.getElementById('modalStep9')).hide();
    
    // Lanjut ke AI untuk merumuskan target Monev
    mulaiStep10();
}

// ==========================================
// STEP 10: AI MONEV (MONITORING & EVALUASI)
// ==========================================
async function mulaiStep10(isRevisi = false) {
    showLoading(true);

    let dataUntukAI = appState.planningFinal;
    
    let promptSystem = `Anda adalah Auditor Mutu Internal Puskesmas.
Tugas Anda adalah membuat 'Kriteria Target' (Indikator Keberhasilan yang SMART) untuk keperluan Monitoring dan Evaluasi dari setiap rencana kegiatan (What).
Keluaran HARUS JSON MURNI:
{
  "monev": [
    {
      "id_plan": "plan_1",
      "kriteria_target": "Deskripsi target kuantitatif dan kualitatif yang harus dicapai..."
    }
  ]
}`;

    if (isRevisi) {
        promptSystem = `Anda adalah Auditor Mutu Internal Puskesmas. User menolak kriteria target sebelumnya dan memberikan rekomendasi. Revisi 'Kriteria Target' agar sesuai dengan rekomendasi user. Keluaran HARUS JSON MURNI format sama.`;
    }

    try {
        const response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: promptSystem + "\n\nData Perencanaan:\n" + JSON.stringify(dataUntukAI) }] }],
                generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
            })
        });

        const data = await response.json();
        const parsed = JSON.parse(data.candidates[0].content.parts[0].text);
        
        // Gabungkan target dari AI ke state kita
        appState.planningFinal = appState.planningFinal.map(plan => {
            const monevData = parsed.monev.find(m => m.id_plan === plan.id_plan);
            return {
                ...plan,
                kriteria_target: monevData ? monevData.kriteria_target : plan.kriteria_target
            };
        });

        renderStep10();

        if (!isRevisi) {
            const modalStep10 = new bootstrap.Modal(document.getElementById('modalStep10'));
            modalStep10.show();
            appState.step = 10;
        }

    } catch (error) {
        alert("Gagal merumuskan target Monev: " + error.message);
    } finally {
        showLoading(false);
    }
}

function renderStep10() {
    let html = '';
    
    appState.planningFinal.forEach(plan => {
        html += `
            <tr>
                <td><strong>${plan.what}</strong></td>
                <td><small>${plan.when} <br> ${plan.where}</small></td>
                <td>${plan.who}</td>
                <td><p class="mb-0 fw-bold text-primary">${plan.kriteria_target}</p></td>
                <td class="bg-light"><em>(Akan diisi saat Monev)</em></td>
                <td class="text-center align-middle">
                    <select class="form-select form-select-sm acc-target" data-id="${plan.id_plan}">
                        <option value="terima">Terima Target</option>
                        <option value="tolak">Tolak & Revisi</option>
                    </select>
                </td>
                <td>
                    <textarea class="form-control form-control-sm rekom-target" data-id="${plan.id_plan}" rows="2" placeholder="Jika tolak, isi instruksi revisi untuk AI di sini...">${plan.rekomendasi_monev || ''}</textarea>
                </td>
            </tr>
        `;
    });

    document.getElementById('tbodyStep10').innerHTML = html;
}

function revisiMonevAI() {
    let butuhRevisi = false;

    // Simpan rekomendasi user ke state sebelum melempar ke AI
    appState.planningFinal = appState.planningFinal.map(plan => {
        const status = document.querySelector(`.acc-target[data-id="${plan.id_plan}"]`).value;
        const rekom = document.querySelector(`.rekom-target[data-id="${plan.id_plan}"]`).value;
        
        if (status === 'tolak') {
            butuhRevisi = true;
        }
        
        return {
            ...plan,
            status_target: status,
            rekomendasi_monev: rekom
        };
    });

    if (butuhRevisi) {
        mulaiStep10(true); // Panggil ulang dengan flag true (mode revisi)
    } else {
        alert("Tidak ada target yang ditolak, tidak perlu re-analisis.");
    }
}

function submitStep10() {
    // Pengecekan akhir
    const adaYangDitolak = appState.planningFinal.some(plan => {
        return document.querySelector(`.acc-target[data-id="${plan.id_plan}"]`).value === 'tolak';
    });

    if (adaYangDitolak) {
        alert("Masih ada Kriteria Target yang Anda tolak. Silakan klik 'Re-Analisis Target' terlebih dahulu atau ubah statusnya menjadi Terima.");
        return;
    }

    bootstrap.Modal.getInstance(document.getElementById('modalStep10')).hide();
    alert("Proses Analisis Masalah hingga Monev Selesai! Saatnya AI merangkum semuanya menjadi Dokumen Laporan Resmi.");
    
    // Nanti akan memanggil fungsi eksporLaporan(Step 11 & 12)
}
