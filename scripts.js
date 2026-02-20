tailwind.config = {
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                sec: {
                    blue: '#0f172a', // Slate 900
                    accent: '#0ea5e9', // Sky 500
                    danger: '#ef4444',
                    success: '#22c55e',
                    warning: '#eab308'
                }
            }
        }
    }
}

// --- Dark Mode Logic ---
document.addEventListener('DOMContentLoaded', () => {
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const htmlEl = document.documentElement;

    // On page load, check for saved preference or system preference
    if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        htmlEl.classList.add('dark');
        if(darkModeToggle) darkModeToggle.checked = true;
    } else {
        htmlEl.classList.remove('dark');
        if(darkModeToggle) darkModeToggle.checked = false;
    }

    // Listener for the toggle
    darkModeToggle?.addEventListener('change', () => {
        if (darkModeToggle.checked) {
            htmlEl.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            htmlEl.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    });

    loadState();
});

// --- Navigation Logic ---
function switchTab(tabId) {
    // Hide all sections
    ['feeder', 'conduit', 'photovoltaic', 'loads', 'grounding', 'guide', 'sketch'].forEach(id => {
        document.getElementById(`tab-${id}`).classList.add('hidden');
        const btn = document.getElementById(`btn-${id}`);
        if (btn) {
            btn.classList.remove('tab-active');
            btn.classList.add('tab-inactive');
        }
    });

    // Show selected
    document.getElementById(`tab-${tabId}`).classList.remove('hidden');
    const activeBtn = document.getElementById(`btn-${tabId}`);
    activeBtn.classList.remove('tab-inactive');
    activeBtn.classList.add('tab-active');
    saveState();

    // Initialize Canvas if sketch tab is selected and not already initialized
    if (tabId === 'sketch') {
        initSketchCanvas();
    }
}

// --- Tool 1: Feeder Logic ---
// Datos de ampacidad según RIC N°04, Tabla 4.4.
// Método B1: Conductores unipolares en ducto sobrepuesto o embutido.
// (Para 3 conductores activos, aislación 70°C, temp. ambiente 30°C)
const wireData = [
    { section: 1.5, amp: 13.5 },
    { section: 2.5, amp: 18 },
    { section: 4.0, amp: 24 },
    { section: 6.0, amp: 31 },
    { section: 10.0, amp: 42 },
    { section: 16.0, amp: 56 },
    { section: 25.0, amp: 73 },
    { section: 35.0, amp: 89 },
    { section: 50.0, amp: 108 }
];

function calculateFeeder() {
    // --- 1. Clear previous errors ---
    const fieldsToValidate = ['f-power', 'f-length', 'f-fp', 'f-simultaneity'];
    fieldsToValidate.forEach(id => {
        document.getElementById(id).classList.remove('border-red-500');
        const errorEl = document.getElementById(`${id}-error`);
        if (errorEl) errorEl.classList.add('hidden');
    });

    // --- 2. Get values and validate ---
    let isValid = true;
    const P_input = document.getElementById('f-power');
    const L_input = document.getElementById('f-length');
    const FP_input = document.getElementById('f-fp');
    const FS_input = document.getElementById('f-simultaneity');

    const P = parseFloat(P_input.value);
    const V = parseFloat(document.getElementById('f-voltage').value);
    const L = parseFloat(L_input.value);
    const FP = parseFloat(FP_input.value);
    const FS = parseFloat(FS_input.value);
    const fT = parseFloat(document.getElementById('f-temp').value);
    const fG = parseFloat(document.getElementById('f-group').value);

    const displayError = (id, message) => {
        document.getElementById(id).classList.add('border-red-500');
        const errorEl = document.getElementById(`${id}-error`);
        errorEl.innerText = message;
        errorEl.classList.remove('hidden');
        isValid = false;
    };

    if (!P_input.value || P <= 0) displayError('f-power', 'Potencia debe ser un número positivo.');
    if (!L_input.value || L <= 0) displayError('f-length', 'Longitud debe ser un número positivo.');
    if (!FP_input.value || FP <= 0 || FP > 1) displayError('f-fp', 'FP debe estar entre 0.01 y 1.');
    if (!FS_input.value || FS <= 0 || FS > 1) displayError('f-simultaneity', 'FS debe estar entre 0.01 y 1.');

    if (!isValid) return;

    // 3. Calculate Current (I)
    const P_ajustada = P * FS;
    let I = 0;
    if (V === 220) {
        I = P_ajustada / (V * FP);
    } else {
        I = P_ajustada / (Math.sqrt(3) * V * FP);
    }

    // Corregir la corriente necesaria por los factores de ajuste.
    const I_corregida = I / (fT * fG);

    // 4. Find Minimum Section by Ampacity
    let selectedWire = wireData.find(w => w.amp >= I_corregida);
    if (!selectedWire) selectedWire = wireData[wireData.length - 1]; // Max out or handle error

    // 5. Check Voltage Drop and Upsize if needed
    // Formula: Vp = K * I * L * Rho / S
    // Rho Copper = 0.018
    // K = 2 (1-ph), 1.73 (3-ph)
    const rho = 0.018;
    const K = (V === 220) ? 2 : 1.732;
    
    let finalSection = selectedWire.section;
    let vDrop = 0;
    let pDrop = 0;

    // Iteratively increase section until drop < 3% or max wire reached
    for (let i = wireData.indexOf(selectedWire); i < wireData.length; i++) {
        finalSection = wireData[i].section;
        vDrop = (K * I * L * rho) / finalSection;
        pDrop = (vDrop / V) * 100;

        if (pDrop <= 3.0) break;
    }

    // 6. Render Results
    document.getElementById('f-result-placeholder').classList.add('hidden');
    document.getElementById('f-result-content').classList.remove('hidden');

    document.getElementById('res-current').innerText = I.toFixed(2) + " A";
    document.getElementById('res-factor-t').innerText = fT.toFixed(2);
    document.getElementById('res-factor-g').innerText = fG.toFixed(2);
    document.getElementById('res-section').innerText = finalSection + " mm²";
    document.getElementById('res-drop-v').innerText = vDrop.toFixed(2) + " V";
    document.getElementById('res-drop-p').innerText = pDrop.toFixed(2) + " %";

    const statusDiv = document.getElementById('res-status');
    if (pDrop > 3.0) {
        statusDiv.className = "mt-4 p-3 rounded text-center font-bold text-sm bg-red-100 text-red-700 border border-red-300";
        statusDiv.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-2"></i>FUERA DE NORMA (>3%)<br>Aumente sección manualmente si es necesario.`;
    } else {
        statusDiv.className = "mt-4 p-3 rounded text-center font-bold text-sm bg-green-100 text-green-700 border border-green-300";
        statusDiv.innerHTML = `<i class="fa-solid fa-check-circle mr-2"></i>CUMPLE NORMATIVA RIC`;
    }

    saveState();
}

// --- Tool 2: Conduit Logic ---
// Áreas externas de cables tipo EVA/RZ1-K según diámetros típicos de mercado.
// El área (en mm²) se calcula como PI * (diametro/2)^2
const wireAreas = {
    "1.5": 7.07,  // Diámetro aprox. 3.0 mm
    "2.5": 9.62,  // Diámetro aprox. 3.5 mm
    "4": 13.20, // Diámetro aprox. 4.1 mm
    "6": 17.35, // Diámetro aprox. 4.7 mm
    "10": 28.27, // Diámetro aprox. 6.0 mm
    "16": 40.72  // Diámetro aprox. 7.2 mm
};

// Approx internal area of conduits (Class IV PVC)
const conduitAreas = {
    "16": 153, // ~14mm ID
    "20": 254, // ~18mm ID
    "25": 415, // ~23mm ID
    "32": 660,
    "40": 1017,
    "50": 1590
};

function calculateConduit() {
    const ductSize = document.getElementById('c-duct-size').value;
    const wireSize = document.getElementById('c-wire-size').value;
    const qty = parseInt(document.getElementById('c-wire-qty').value);

    const totalWireArea = wireAreas[wireSize] * qty;
    const ductArea = conduitAreas[ductSize];
    
    const occupation = (totalWireArea / ductArea) * 100;

    const circle = document.getElementById('c-result-circle');
    const text = document.getElementById('c-result-percent');
    const msg = document.getElementById('c-result-text');

    text.innerText = occupation.toFixed(1) + "%";

    if (occupation > 40) {
        circle.className = "w-32 h-32 rounded-full border-8 border-red-500 flex items-center justify-center mb-4 transition-all duration-500 bg-red-50";
        text.className = "text-2xl font-bold text-red-600";
        msg.innerHTML = `<span class="font-bold text-red-600"><i class="fa-solid fa-xmark"></i> Rechazado (>40%)</span>`;
    } else {
        circle.className = "w-32 h-32 rounded-full border-8 border-green-500 flex items-center justify-center mb-4 transition-all duration-500 bg-green-50";
        text.className = "text-2xl font-bold text-green-600";
        msg.innerHTML = `<span class="font-bold text-green-600"><i class="fa-solid fa-check"></i> Aprobado (≤40%)</span>`;
    }

    saveState();
}

// --- Tool 2.5: Photovoltaic Logic ---
function calculatePhotovoltaic() {
    // 1. Get all input values
    const panelWp = parseFloat(document.getElementById('pv-panel-wp').value);
    const panelVoc = parseFloat(document.getElementById('pv-panel-voc').value);
    const panelIsc = parseFloat(document.getElementById('pv-panel-isc').value);
    const seriesCount = parseInt(document.getElementById('pv-string-series').value);
    const parallelCount = parseInt(document.getElementById('pv-string-parallel').value);
    const inverterVmax = parseFloat(document.getElementById('pv-inverter-volt').value);
    const inverterImax = parseFloat(document.getElementById('pv-inverter-curr').value);

    // Basic validation
    if (isNaN(panelWp) || isNaN(panelVoc) || isNaN(panelIsc) || isNaN(seriesCount) || isNaN(parallelCount) || isNaN(inverterVmax) || isNaN(inverterImax)) {
        return; // Or show a placeholder
    }

    // 2. Perform calculations
    const totalWp = panelWp * seriesCount * parallelCount;
    const stringVoc = panelVoc * seriesCount;
    const arrayIsc = panelIsc * parallelCount;

    // 3. Render total power
    document.getElementById('pv-res-power').innerText = (totalWp / 1000).toFixed(2) + " kWp";

    // 4. Validate Voltage
    const voltStatusDiv = document.getElementById('pv-res-status-volt');
    // IEC 60364-7-712 recommends a safety factor for temperature. A simple 1.15 is common for cold conditions.
    const vocCorrected = stringVoc * 1.15; 
    if (vocCorrected > inverterVmax) {
        voltStatusDiv.className = "p-3 rounded text-center font-bold text-sm bg-red-100 text-red-700 border border-red-300";
        voltStatusDiv.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-2"></i>VOLTAJE EXCEDE LÍMITE<br>Voc corregido (${vocCorrected.toFixed(1)}V) > Inversor (${inverterVmax}V). Reduzca paneles en serie.`;
    } else {
        voltStatusDiv.className = "p-3 rounded text-center font-bold text-sm bg-green-100 text-green-700 border border-green-300";
        voltStatusDiv.innerHTML = `<i class="fa-solid fa-check-circle mr-2"></i>VOLTAJE COMPATIBLE<br>Voc corregido (${vocCorrected.toFixed(1)}V) ≤ Inversor (${inverterVmax}V).`;
    }

    // 5. Validate Current
    const currStatusDiv = document.getElementById('pv-res-status-curr');
    // Safety factor for Isc (e.g., 1.25 for irradiance gain)
    const iscCorrected = arrayIsc * 1.25;
    if (iscCorrected > inverterImax) {
        currStatusDiv.className = "p-3 rounded text-center font-bold text-sm bg-yellow-100 text-yellow-700 border border-yellow-300";
        currStatusDiv.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-2"></i>CORRIENTE ELEVADA<br>Isc corregida (${iscCorrected.toFixed(1)}A) > Inversor (${inverterImax}A). Considere otro MPPT o inversor.`;
    } else {
        currStatusDiv.className = "p-3 rounded text-center font-bold text-sm bg-green-100 text-green-700 border border-green-300";
        currStatusDiv.innerHTML = `<i class="fa-solid fa-check-circle mr-2"></i>CORRIENTE COMPATIBLE<br>Isc corregida (${iscCorrected.toFixed(1)}A) ≤ Inversor (${inverterImax}A).`;
    }

    // 6. Suggest components
    // Cable (based on Isc per string)
    const stringIscCorrected = panelIsc * 1.25;
    let cableSize = "4 mm²";
    if (stringIscCorrected > 13) cableSize = "6 mm²"; // Ampacity of 4mm2 is ~17A, 6mm2 is ~22A in free air. Simple rule.
    if (stringIscCorrected > 20) cableSize = "10 mm²";
    document.getElementById('pv-res-cable').innerText = cableSize;

    // Fuse (based on Isc per string, factor 1.56 is common)
    const fuseMinRating = panelIsc * 1.56;
    const fuseSizes = [10, 12, 15, 20, 25];
    let suggestedFuse = fuseSizes.find(size => size >= fuseMinRating) || fuseSizes[fuseSizes.length - 1];
    document.getElementById('pv-res-fuse').innerText = `${suggestedFuse}A (1000V DC)`;

    // SPD (based on corrected Voc)
    let spdVoltage = "600V DC";
    if (vocCorrected > 600) spdVoltage = "1000V DC";
    if (vocCorrected > 1000) spdVoltage = "1500V DC";
    document.getElementById('pv-res-spd').innerText = `Tipo 2, Ucpv ≥ ${spdVoltage}`;

    saveState();
}

// --- Tool 3: Load Schedule Logic ---
let totalWatts = 0;

function updateCircuitSuggestions() {
    const nameInput = document.getElementById('l-name');
    const powerInput = document.getElementById('l-power');
    const protectionInput = document.getElementById('l-protection');
    const wireSectionInput = document.getElementById('l-wire-section');
    const differentialInput = document.getElementById('l-differential');

    const power = parseFloat(powerInput.value);
    const name = nameInput.value.toLowerCase();

    // --- 1. Suggest Protection (Breaker) ---
    if (isNaN(power) || power <= 0) {
        protectionInput.value = '';
        return; // Exit if no valid power
    }

    const current = power / 220;
    const breakerSizes = [6, 10, 16, 20, 25, 32, 40];
    let suggestedBreaker = breakerSizes[breakerSizes.length - 1];
    for (const size of breakerSizes) {
        if (size >= current) {
            suggestedBreaker = size;
            break;
        }
    }
    protectionInput.value = `1x${suggestedBreaker}A`;

    // --- 2. Suggest Wire Section ---
    // Find the minimum wire section that can handle the breaker's current (I_conductor >= I_proteccion)
    const suggestedWire = wireData.find(w => w.amp >= suggestedBreaker);
    if (suggestedWire) {
        wireSectionInput.value = suggestedWire.section;
    } else {
        // If breaker is > max wire ampacity in our table, select the max wire.
        wireSectionInput.value = wireData[wireData.length - 1].section;
    }

    // --- 3. Suggest Differential Type ---
    // Suggests "Tipo A" for circuits with electronics.
    const electronicKeywords = ['pc', 'computador', 'escritorio', 'oficina', 'electronica', 'tv', 'audio', 'server', 'servidor'];
    const needsSuperImmunized = electronicKeywords.some(keyword => name.includes(keyword));
    
    if (needsSuperImmunized) {
        differentialInput.value = 'Tipo A';
    } else {
        differentialInput.value = 'General';
    }
}

// --- Table Editing Helpers ---
function editFocus(el, suffix = '') {
    const text = el.innerText;
    if (suffix && text.includes(suffix)) {
        el.innerText = text.replace(suffix, '').trim();
    }
}

function editBlur(el, suffix = '', isPower = false) {
    let text = el.innerText.trim();
    if (text === '') text = '0';
    
    if (suffix) {
        const val = parseFloat(text);
        if (!isNaN(val)) {
            el.innerText = val + suffix;
        } else {
            el.innerText = text + suffix;
        }
    }
    
    if (isPower) {
        recalculateLoadTotals();
    }
    saveState();
}

function recalculateLoadTotals() {
    totalWatts = 0;
    const rows = document.querySelectorAll('#load-table-body tr');
    rows.forEach(row => {
        const powerText = row.cells[1].innerText;
        // parseFloat parsea hasta encontrar un caracter no numérico, por lo que "100 W" funciona
        const power = parseFloat(powerText) || 0; 
        totalWatts += power;
    });
    updateTotalDisplay();
}

function addLoadRow() {
    // --- 1. Clear previous errors ---
    const fieldsToValidate = ['l-name', 'l-power', 'l-protection', 'l-wire-section', 'l-differential'];
    fieldsToValidate.forEach(id => {
        const field = document.getElementById(id);
        const errorEl = document.getElementById(`${id}-error`);
        
        if (field) field.classList.remove('border-red-500');
        if (errorEl) errorEl.classList.add('hidden');
    });

    // --- 2. Get values and validate ---
    let isValid = true;
    const nameInput = document.getElementById('l-name');
    const powerInput = document.getElementById('l-power');
    const protectionInput = document.getElementById('l-protection');
    const wireSectionInput = document.getElementById('l-wire-section');
    const differentialInput = document.getElementById('l-differential');

    const name = nameInput.value.trim();
    const power = parseFloat(powerInput.value);
    const protection = protectionInput.value.trim();
    const wireSection = parseFloat(wireSectionInput.value);

    const differential = differentialInput.value;
    const displayError = (id, message) => {
        document.getElementById(id).classList.add('border-red-500');
        const errorEl = document.getElementById(`${id}-error`);
        errorEl.innerText = message;
        errorEl.classList.remove('hidden');
        isValid = false;
    };

    if (!name) displayError('l-name', 'Seleccione un circuito de la lista.');
    if (!powerInput.value || isNaN(power) || power <= 0) displayError('l-power', 'Ingrese una potencia válida y positiva.');
    if (!protection) displayError('l-protection', 'Protección no sugerida. Ingrese una potencia válida.');

    // --- 3. Validación de Ampacidad (Coordinación Protección-Conductor) ---
    let isSafe = true;
    if (isValid && protection && wireSection) {
        const breakerRating = parseFloat(protection.split('x')[1]);
        const maxPowerForBreaker = breakerRating * 220;
        let errorMessage = '';

        // Nueva validación: Potencia vs Capacidad del Disyuntor
        if (power > maxPowerForBreaker) {
            errorMessage = `Potencia de ${power}W excede el máximo de ${maxPowerForBreaker}W para un disyuntor de ${breakerRating}A.`;
            displayError('l-power', `¡Riesgo! ${errorMessage}`);
            isSafe = false;
        }
        // Validación de coordinación entre conductor y protección
        else if (wireSection === 1.5 && breakerRating > 10) {
            errorMessage = `Para 1.5mm² (alumbrado), la protección no debe superar 10A.`;
        } else if (wireSection === 2.5 && breakerRating > 16) {
            errorMessage = `Para 2.5mm² (enchufes), la protección no debe superar 16A.`;
        } else {
            const wireInfo = wireData.find(w => w.section === wireSection);
            const maxWireAmps = wireInfo ? wireInfo.amp : 0;
            if (breakerRating > maxWireAmps) {
                errorMessage = `Protección de ${breakerRating}A es muy alta para cable de ${wireSection}mm² (Máx: ${maxWireAmps}A).`;
            }
        }

        if (errorMessage && isSafe) {
            displayError('l-protection', `¡Riesgo! ${errorMessage}`);
            isSafe = false;
        }
    }

    if (!isValid || !isSafe) return;
    
    const tbody = document.getElementById('load-table-body');
    const row = document.createElement('tr');
    row.className = "border-b hover:bg-slate-50 transition dark:border-slate-700 dark:hover:bg-slate-700/50";
    row.innerHTML = `
                <td class="p-3 font-medium" contenteditable="true" onblur="saveState()">${name}</td>
                <td class="p-3" contenteditable="true" onfocus="editFocus(this, ' W')" onblur="editBlur(this, ' W', true)">${power} W</td>
                <td class="p-3" contenteditable="true" onfocus="editFocus(this, ' mm²')" onblur="editBlur(this, ' mm²')">${wireSection.toFixed(1)} mm²</td>
                <td class="p-3"><span class="bg-slate-200 px-2 py-1 rounded text-xs font-bold dark:bg-slate-700 dark:text-slate-300" contenteditable="true" onblur="saveState()">${protection}</span></td>                
                <td class="p-3"><span class="bg-slate-200 px-2 py-1 rounded text-xs font-bold dark:bg-slate-700 dark:text-slate-300" contenteditable="true" onblur="saveState()">${differential}</span></td>
                <td class="p-3 text-center">
                    <button onclick="removeRow(this)" class="text-red-500 hover:text-red-700">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>                
            `;
    tbody.appendChild(row);

    // --- 3. Update Total ---
    totalWatts += power;
    updateTotalDisplay();

    // --- 4. Clear inputs ---
    nameInput.selectedIndex = 0;
    powerInput.value = "";
    protectionInput.value = "";
    wireSectionInput.value = "1.5";
    differentialInput.value = "General";
    saveState();
}

function removeRow(btn) {
    const row = btn.closest('tr');
    row.remove();
    recalculateLoadTotals();
    saveState();
}

function updateTotalDisplay() {
    // RIC N°03, 5.4.2.2 - Factor de Demanda para viviendas.
    // 100% a los primeros 3kW, 70% al resto.
    let demandedWatts = 0;
    if (totalWatts <= 3000) {
        demandedWatts = totalWatts;
    } else {
        demandedWatts = 3000 + (totalWatts - 3000) * 0.70;
    }

    document.getElementById('l-total-power').innerText = totalWatts.toLocaleString() + " W";
    document.getElementById('l-demanded-power').innerText = demandedWatts.toLocaleString(undefined, {maximumFractionDigits: 0}) + " W";
}

function useDemandedPowerForFeeder() {
    // 1. Get the demanded power value from the DOM.
    const demandedPowerText = document.getElementById('l-demanded-power').innerText;
    // Remove non-digit characters to parse the number correctly, regardless of locale formatting.
    const demandedPowerValue = parseFloat(demandedPowerText.replace(/[^0-9]/g, ''));

    if (isNaN(demandedPowerValue) || demandedPowerValue <= 0) {
        alert('No hay potencia demandada para calcular. Agregue circuitos al cuadro de cargas.');
        return;
    }

    // 2. Set this value in the feeder calculator's power input.
    document.getElementById('f-power').value = demandedPowerValue;
    document.getElementById('f-simultaneity').value = 1.0; // La potencia ya está ajustada por demanda

    // 3. Switch to the feeder tab to show the user the result.
    switchTab('feeder');

    // 4. Recalculate the feeder with the new power value.
    calculateFeeder();
}

// --- Tool 4: Grounding Logic ---
function calculateGrounding() {
    const rho_input = document.getElementById('g-resistivity');
    const L_input = document.getElementById('g-length');
    const d_input = document.getElementById('g-diameter');

    const rho = parseFloat(rho_input.value); // Resistividad en Ω.m
    const L = parseFloat(L_input.value);     // Longitud en m
    const d = parseFloat(d_input.value);     // Diámetro en mm

    if (!rho_input.value || !L_input.value || !d_input.value || rho <= 0 || L <= 0 || d <= 0) {
        document.getElementById('g-result-placeholder').classList.remove('hidden');
        document.getElementById('g-result-content').classList.add('hidden');
        return;
    }

    // Convertir diámetro de mm a m
    const d_m = d / 1000;

    // Fórmula de Dwight para un electrodo vertical
    // R = (ρ / (2 * π * L)) * (ln(4L/d) - 1)
    const R = (rho / (2 * Math.PI * L)) * (Math.log((4 * L) / d_m) - 1);

    // Render Results
    document.getElementById('g-result-placeholder').classList.add('hidden');
    document.getElementById('g-result-content').classList.remove('hidden');

    document.getElementById('res-grounding').innerText = R.toFixed(2) + " Ω";

    const statusDiv = document.getElementById('g-res-status');
    // La norma RIC N°06 (punto 5.2.3) exige <= 20 Ohm para instalaciones de consumo.
    if (R > 20) {
        statusDiv.className = "mt-4 p-3 rounded text-center font-bold text-sm bg-yellow-100 text-yellow-700 border border-yellow-300";
        statusDiv.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-2"></i>VALOR ELEVADO (>20 Ω)<br>Se recomienda mejorar el sistema o usar más electrodos.`;
    } else {
        statusDiv.className = "mt-4 p-3 rounded text-center font-bold text-sm bg-green-100 text-green-700 border border-green-300";
        statusDiv.innerHTML = `<i class="fa-solid fa-check-circle mr-2"></i>VALOR ACEPTABLE (≤20 Ω)<br>Cumple para instalaciones de consumo BT.`;
    }

    saveState();
}

// --- Export Logic ---
function openReportModal() {
    document.getElementById('report-modal').classList.remove('hidden');
}

function closeReportModal() {
    document.getElementById('report-modal').classList.add('hidden');
}

function exportPDF() {
    closeReportModal(); // Close modal first
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const installerName = document.getElementById('installer-name').value.trim();
    const installerLicense = document.getElementById('installer-license').value;

    // --- Document Header ---
    doc.setFontSize(18);
    doc.setTextColor('#0f172a'); // sec.blue
    doc.text("Memoria de Cálculo Eléctrico", 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Fecha de Generación: ${new Date().toLocaleDateString('es-CL')}`, 14, 30);

    let yPos = 45; // Initial Y position for content
    let sectionNum = 1;

    // Get Checkbox States
    const includeFeeder = document.getElementById('chk-feeder').checked;
    const includeConduit = document.getElementById('chk-conduit').checked;
    const includeLoads = document.getElementById('chk-loads').checked;
    const includePV = document.getElementById('chk-photovoltaic').checked;
    const includeGrounding = document.getElementById('chk-grounding').checked;

    // --- 1. Feeder Calculation Results ---
    if (includeFeeder) {
        doc.setFontSize(14);
        doc.setTextColor('#0f172a');
        doc.text(`${sectionNum}. Cálculo de Alimentador`, 14, yPos);
        sectionNum++;
        yPos += 8;
        if (!document.getElementById('f-result-content').classList.contains('hidden')) {
            const current = document.getElementById('res-current').innerText;
            const section = document.getElementById('res-section').innerText;
            const dropV = document.getElementById('res-drop-v').innerText;
            const dropP = document.getElementById('res-drop-p').innerText;
            const status = document.getElementById('res-status').innerText;
            const fT = document.getElementById('res-factor-t').innerText;
            const fG = document.getElementById('res-factor-g').innerText;
            const temp = document.getElementById('f-temp').options[document.getElementById('f-temp').selectedIndex].text;
            const group = document.getElementById('f-group').options[document.getElementById('f-group').selectedIndex].text;

            doc.autoTable({
                startY: yPos,
                head: [['Parámetro', 'Valor']],
                body: [
                    ['Corriente Nominal', current],
                    [`Factor de Temperatura (${temp})`, fT],
                    [`Factor de Agrupamiento (${group} cond.)`, fG],
                    ['Sección Sugerida (Cu)', section],
                    ['Caída de Tensión (V)', dropV],
                    ['Porcentaje Caída (%)', dropP],
                    ['Estado Normativo', status.replace(/\n/g, ' ')]
                ],
                theme: 'grid',
                headStyles: { fillColor: '#0f172a' }
            });
            yPos = doc.autoTable.previous.finalY + 15;
        } else {
            doc.setFontSize(10);
            doc.setTextColor(150);
            doc.text("No se han ingresado datos para esta sección.", 14, yPos);
            yPos += 10;
        }
    }

    // --- 2. Conduit Occupation Results ---
    if (includeConduit) {
        if (yPos > 250) { doc.addPage(); yPos = 20; }
        doc.setFontSize(14);
        doc.setTextColor('#0f172a');
        doc.text(`${sectionNum}. Ocupación de Ducto`, 14, yPos);
        sectionNum++;
        yPos += 8;
        if (document.getElementById('c-result-percent').innerText !== '0%') {
            const occupationPercent = document.getElementById('c-result-percent').innerText;
            const ductSize = document.getElementById('c-duct-size').options[document.getElementById('c-duct-size').selectedIndex].text;
            const wireSize = document.getElementById('c-wire-size').options[document.getElementById('c-wire-size').selectedIndex].text;
            const wireQty = document.getElementById('c-wire-qty').value;
            const status = document.getElementById('c-result-text').innerText;

            doc.autoTable({
                startY: yPos,
                head: [['Parámetro', 'Valor']],
                body: [
                    ['Diámetro del Ducto', ductSize],
                    ['Sección del Conductor', wireSize],
                    ['Cantidad de Conductores', wireQty],
                    ['Porcentaje de Ocupación', occupationPercent],
                    ['Estado Normativo', status]
                ],
                theme: 'grid',
                headStyles: { fillColor: '#0f172a' }
            });
            yPos = doc.autoTable.previous.finalY + 15;
        } else {
            doc.setFontSize(10);
            doc.setTextColor(150);
            doc.text("No se han ingresado datos para esta sección.", 14, yPos);
            yPos += 10;
        }
    }

    // --- 3. Load Schedule ---
    if (includeLoads) {
        if (yPos > 250) { doc.addPage(); yPos = 20; }
        doc.setFontSize(14);
        doc.setTextColor('#0f172a');
        doc.text(`${sectionNum}. Cuadro de Cargas`, 14, yPos);
        sectionNum++;
        yPos += 8;
        if (document.getElementById('load-table-body').rows.length > 0) {
            const loadTableBody = document.getElementById('load-table-body');
            doc.autoTable({
                startY: yPos,
                head: [['Circuito', 'Potencia (W)', 'Sección Cable', 'Protección', 'Diferencial']],
                body: Array.from(loadTableBody.rows).map(row => [
                    row.cells[0].innerText,
                    row.cells[1].innerText,
                    row.cells[2].innerText,
                    row.cells[3].innerText,
                    row.cells[4].innerText
                ]),
                foot: [
                    [{ content: 'TOTAL INSTALADO:', colSpan: 3, styles: { halign: 'right', fontStyle: 'normal' } }, document.getElementById('l-total-power').innerText],
                    [{ content: 'POTENCIA DEMANDADA:', colSpan: 3, styles: { halign: 'right' } }, document.getElementById('l-demanded-power').innerText]
                ],
                theme: 'grid',
                headStyles: { fillColor: '#0f172a' },
                footStyles: { fillColor: '#e2e8f0', textColor: '#0f172a', fontStyle: 'bold' }
            });
            yPos = doc.autoTable.previous.finalY + 5;

            // Justificación Técnica
            doc.setFontSize(9);
            doc.setTextColor(80);
            const justification = "Nota Técnica: El dimensionamiento de conductores y protecciones se ha realizado conforme al Pliego Técnico RIC N°03, asegurando la coordinación entre la capacidad de transporte de los conductores y la corriente nominal de las protecciones, así como la selectividad de las protecciones diferenciales.";
            const splitText = doc.splitTextToSize(justification, 180);
            doc.text(splitText, 14, yPos);
            yPos += (splitText.length * 4) + 10;
        } else {
            doc.setFontSize(10);
            doc.setTextColor(150);
            doc.text("No se han ingresado datos para esta sección.", 14, yPos);
            yPos += 10;
        }
    }

    // --- 4. Photovoltaic System ---
    if (includePV) {
        if (yPos > 250) { doc.addPage(); yPos = 20; }
        doc.setFontSize(14);
        doc.setTextColor('#0f172a');
        doc.text(`${sectionNum}. Sistema Fotovoltaico`, 14, yPos);
        sectionNum++;
        yPos += 8;
        if (document.getElementById('pv-res-power').innerText !== '0 kWp') {
            const pvPower = document.getElementById('pv-res-power').innerText;
            const pvCable = document.getElementById('pv-res-cable').innerText;
            const pvFuse = document.getElementById('pv-res-fuse').innerText;
            const pvSpd = document.getElementById('pv-res-spd').innerText;
            const pvVoltStatus = document.getElementById('pv-res-status-volt').innerText;
            const pvCurrStatus = document.getElementById('pv-res-status-curr').innerText;

            doc.autoTable({
                startY: yPos,
                head: [['Parámetro', 'Valor']],
                body: [
                    ['Potencia Total (Peak)', pvPower],
                    ['Cable Solar Sugerido', pvCable],
                    ['Fusible DC Sugerido', pvFuse],
                    ['Descargador (SPD)', pvSpd],
                    ['Estado Voltaje', pvVoltStatus.replace(/\n/g, ' ')],
                    ['Estado Corriente', pvCurrStatus.replace(/\n/g, ' ')]
                ],
                theme: 'grid',
                headStyles: { fillColor: '#0f172a' }
            });
            yPos = doc.autoTable.previous.finalY + 15;
        } else {
            doc.setFontSize(10);
            doc.setTextColor(150);
            doc.text("No se han ingresado datos para esta sección.", 14, yPos);
            yPos += 10;
        }
    }

    // --- 5. Grounding System ---
    if (includeGrounding) {
        if (yPos > 250) { doc.addPage(); yPos = 20; }
        doc.setFontSize(14);
        doc.setTextColor('#0f172a');
        doc.text(`${sectionNum}. Puesta a Tierra`, 14, yPos);
        sectionNum++;
        yPos += 8;
        if (!document.getElementById('g-result-content').classList.contains('hidden')) {
            const rValue = document.getElementById('res-grounding').innerText;
            const rStatus = document.getElementById('g-res-status').innerText;
            const resistivity = document.getElementById('g-resistivity').value;

            doc.autoTable({
                startY: yPos,
                head: [['Parámetro', 'Valor']],
                body: [
                    ['Resistividad del Terreno', resistivity + ' Ω.m'],
                    ['Resistencia Calculada', rValue],
                    ['Estado Normativo', rStatus.replace(/\n/g, ' ')]
                ],
                theme: 'grid',
                headStyles: { fillColor: '#0f172a' }
            });
            yPos = doc.autoTable.previous.finalY + 15;
        } else {
            doc.setFontSize(10);
            doc.setTextColor(150);
            doc.text("No se han ingresado datos para esta sección.", 14, yPos);
            yPos += 10;
        }
    }

    // --- Signature Section ---
    const pageCount = doc.internal.getNumberOfPages();
    doc.setPage(pageCount);
    const pageHeight = doc.internal.pageSize.height;

    // If the last content was too close to the bottom, add a new page for the signature
    if (yPos > pageHeight - 50) { 
        doc.addPage();
        doc.setPage(doc.internal.getNumberOfPages());
    }

    let signatureY = pageHeight - 40; // 40 units from bottom
    
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.line(70, signatureY, 140, signatureY); // Signature line
    signatureY += 5;
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text(installerName || "__________________________", 105, signatureY, { align: "center" });
    signatureY += 5;
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Instalador Eléctrico Autorizado (Licencia ${installerLicense})`, 105, signatureY, { align: "center" });

    // --- Save the PDF ---
    doc.save('Memoria_de_Calculo_SEC.pdf');
}

function exportLabelsPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const rows = document.querySelectorAll('#load-table-body tr');
    if (rows.length === 0) {
        alert("No hay circuitos para generar etiquetas.");
        return;
    }

    // Configuración de etiquetas (Grid 3 columnas en A4)
    const startX = 10;
    const startY = 20;
    const labelWidth = 60;
    const labelHeight = 30;
    const gapX = 5;
    const gapY = 5;
    
    let x = startX;
    let y = startY;

    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text("Etiquetas de Tablero - Calculadora Pro SEC", 105, 12, { align: "center" });

    rows.forEach((row) => {
        // Extraer datos de la fila
        const name = row.cells[0].innerText;
        const protection = row.cells[3].innerText;
        const differential = row.cells[4].innerText;

        // Dibujar borde etiqueta
        doc.setDrawColor(100);
        doc.setLineWidth(0.5);
        doc.rect(x, y, labelWidth, labelHeight);

        // Contenido
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text(name, x + (labelWidth/2), y + 8, { align: "center", maxWidth: labelWidth - 4 });

        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.text(`Disyuntor: ${protection}`, x + (labelWidth/2), y + 16, { align: "center" });
        doc.text(`Diferencial: ${differential}`, x + (labelWidth/2), y + 22, { align: "center" });

        // Mover cursor
        x += labelWidth + gapX;

        // Salto de línea (3 columnas)
        if (x > (startX + (labelWidth + gapX) * 2)) {
            x = startX;
            y += labelHeight + gapY;
        }

        // Nueva página si se acaba el espacio
        if (y + labelHeight > 280) {
            doc.addPage();
            y = startY;
            x = startX;
        }
    });

    doc.save('Etiquetas_Tablero.pdf');
}

// --- Tool: Sketch / Canvas Logic (Fabric.js) ---
let canvas;
let currentDrawingMode = null; // To track wall vs connection drawing
let canvasHistory = [];
let isUndoing = false;
let savedCanvasJSON = null; // Temp store for loading canvas state

function initSketchCanvas() {
    if (canvas) return; // Already initialized

    const container = document.getElementById('canvas-container');
    // Create canvas with container dimensions
    if (container) {
        canvas = new fabric.Canvas('sketch-canvas', {
            width: container.clientWidth,
            height: container.clientHeight,
            backgroundColor: '#ffffff', // White paper background
            selection: true
        });
    }
    
    // Load canvas from state if it was loaded into our temp variable
    if (savedCanvasJSON) {
        canvas.loadFromJSON(savedCanvasJSON, canvas.renderAll.bind(canvas));
        savedCanvasJSON = null; // Clear it after use
    }

    // Initialize History
    saveHistory();
    
    // Save history and persist state on canvas changes
    const handleCanvasChange = () => {
        if (!isUndoing) { saveHistory(); saveState(); }
    };
    canvas.on('object:added', handleCanvasChange);
    canvas.on('object:modified', handleCanvasChange);
    canvas.on('object:removed', handleCanvasChange);

    // Disable scaling controls for multi-selections to prevent accidental resizing.
    canvas.on('selection:created', function (opt) {
        if (opt.target.type === 'activeSelection') {
            opt.target.hasControls = false;
        }
    });

    // Handle resize
    window.addEventListener('resize', () => {
        const container = document.getElementById('canvas-container');
        if (container && canvas) {
            canvas.setDimensions({
                width: container.clientWidth,
                height: container.clientHeight
            });
        }
    });

    // Keyboard Shortcuts (Delete & Ctrl+Z)
    document.addEventListener('keydown', (e) => {
        const sketchTab = document.getElementById('tab-sketch');
        if (sketchTab && !sketchTab.classList.contains('hidden')) {
            if (e.key === 'Delete') {
                deleteSelected();
            }
            // Ctrl+Z for Undo
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                undoLastAction();
            }
        }
    });

    // Ensure free-drawn lines also don't have resize controls
    canvas.on('path:created', function(e) {
        e.path.set({ hasControls: false, padding: 5 });
    });
}

function saveHistory() {
    if (!canvas) return;
    // Limit history to last 10 states to save memory
    if (canvasHistory.length > 10) canvasHistory.shift();
    canvasHistory.push(JSON.stringify(canvas));
}

function undoLastAction() {
    if (!canvas || canvasHistory.length < 2) return;
    
    isUndoing = true;
    canvasHistory.pop(); // Remove current state
    const prevState = canvasHistory[canvasHistory.length - 1];
    
    canvas.loadFromJSON(prevState, () => {
        canvas.renderAll();
        isUndoing = false;
        // After undoing, the new state must be saved to localStorage
        saveState();
    });
}

function updateConnectionColor() {
    const colorPicker = document.getElementById('connection-color-picker');
    if (canvas && canvas.isDrawingMode && currentDrawingMode === 'connection') {
        canvas.freeDrawingBrush.color = colorPicker.value;
    }
    // Save the color preference whenever it's changed
    saveState();
}

function toggleDrawingMode(mode) {
    if (!canvas) return;

    const connBtn = document.getElementById('btn-draw-connection');

    // If the clicked mode is already active, turn it off.
    if (currentDrawingMode === mode) {
        canvas.isDrawingMode = false;
        currentDrawingMode = null;
        if (connBtn) connBtn.classList.remove('bg-sec-accent', 'text-white');
        return;
    }

    // Activate the new mode
    canvas.isDrawingMode = true;
    currentDrawingMode = mode;

    if (mode === 'connection') {
        const colorPicker = document.getElementById('connection-color-picker');
        canvas.freeDrawingBrush.color = colorPicker.value;
        canvas.freeDrawingBrush.width = 2;
        canvas.freeDrawingBrush.strokeDashArray = [5, 5]; // Dashed line
        if (connBtn) connBtn.classList.add('bg-sec-accent', 'text-white');
    }
}

function addArchitecturalSymbol(type) {
    if (!canvas) return;

    // Deactivate drawing mode if active
    if (canvas.isDrawingMode) {
        toggleDrawingMode(currentDrawingMode); // This will turn it off
    }

    let group;
    const center = canvas.getCenter();
    const left = center.left;
    const top = center.top;
    const color = '#334155'; // slate-700

    if (type === 'door') {
        const openingHeight = 40;
        const doorSwingWidth = 35;

        // This rectangle will act as a mask to hide the wall of the room underneath.
        const wallMask = new fabric.Rect({
            width: 8, // A bit wider than the wall stroke (5)
            height: openingHeight,
            fill: 'white', // The background color of the canvas
            originX: 'center',
            originY: 'center'
        });

        // The door swing path, for a door hinged on the left, opening inwards.
        const doorPath = new fabric.Path(`M 0,${-openingHeight/2} A ${doorSwingWidth} ${doorSwingWidth} 0 0 1 ${doorSwingWidth}, ${openingHeight/2}`, {
            fill: 'transparent',
            stroke: color,
            strokeWidth: 2,
            objectCaching: false
        });
        group = new fabric.Group([wallMask, doorPath], { left: left, top: top, originX: 'center', originY: 'center' });
    }
    else if (type === 'window') {
        const frame = new fabric.Rect({
            width: 60, height: 15, fill: 'white', stroke: color, strokeWidth: 2, originX: 'center', originY: 'center'
        });
        const glass = new fabric.Line([-30, 0, 30, 0], { stroke: color, strokeWidth: 1, originX: 'center', originY: 'center' });
        group = new fabric.Group([frame, glass], { left: left, top: top });
    }

    if (group) {
        group.set({ hasControls: false, padding: 5 }); // Disable resize handles
        canvas.add(group);
        canvas.setActiveObject(group);
        canvas.renderAll();
    }
}

function addText() {
    if (!canvas) return;
    if (canvas.isDrawingMode) { toggleDrawingMode(currentDrawingMode); } // Deactivate drawing if active

    const text = new fabric.IText('Texto', {
        left: canvas.getCenter().left,
        top: canvas.getCenter().top,
        fontFamily: 'sans-serif',
        fontSize: 20,
        fill: '#334155', // slate-700
        originX: 'center',
        originY: 'center',
        hasControls: false,
        padding: 5
    });

    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.renderAll();
}

function addRoom() {
    if (!canvas) return;
    if (canvas.isDrawingMode) { toggleDrawingMode(currentDrawingMode); } // Deactivate drawing if active

    const room = new fabric.Rect({
        left: canvas.getCenter().left - 100,
        top: canvas.getCenter().top - 75,
        width: 200,
        height: 150,
        fill: 'transparent',
        stroke: '#334155', // slate-700
        strokeWidth: 5,
        strokeUniform: true, // Keeps stroke width constant on scaling
        objectCaching: false,
    });

    if (room) {
        room.set({ hasControls: true, padding: 5, lockRotation: true }); // Enable resize handles
        room.setControlsVisibility({ mtr: false }); // Hide rotation handle
        canvas.add(room);
        canvas.setActiveObject(room);
        canvas.renderAll();
    }
}

function addSymbol(type) {
    if (!canvas) return;

    // Deactivate drawing mode if active
    if (canvas.isDrawingMode) {
        toggleDrawingMode(currentDrawingMode); // This will turn it off
    }

    let group;
    const center = canvas.getCenter();
    const left = center.left;
    const top = center.top;
    const color = 'black';

    if (type === 'light') {
        // Symbol: Circle with X (Centro de Alumbrado)
        const circle = new fabric.Circle({
            radius: 15, fill: 'transparent', stroke: color, strokeWidth: 2, originX: 'center', originY: 'center'
        });
        const line1 = new fabric.Line([-10, -10, 10, 10], { stroke: color, strokeWidth: 2, originX: 'center', originY: 'center' });
        const line2 = new fabric.Line([-10, 10, 10, -10], { stroke: color, strokeWidth: 2, originX: 'center', originY: 'center' });
        
        group = new fabric.Group([circle, line1, line2], { left: left, top: top });
    } 
    else if (type === 'junction') {
        // Symbol: Caja de Derivación (Square)
        const rect = new fabric.Rect({
            width: 15, height: 15, fill: 'white', stroke: color, strokeWidth: 2, originX: 'center', originY: 'center'
        });
        group = new fabric.Group([rect], { left: left, top: top });
    }
    else if (type === 'socket') {
        // Symbol: Semicircle with lines (Enchufe)
        const arc = new fabric.Path('M -15 0 A 15 15 0 0 1 15 0', {
            fill: 'transparent', stroke: color, strokeWidth: 2, originX: 'center', originY: 'center'
        });
        const line1 = new fabric.Line([0, 0, 0, -10], { stroke: color, strokeWidth: 2, originX: 'center', originY: 'center', top: -5 }); // Prong
        const line2 = new fabric.Line([-15, 0, 15, 0], { stroke: color, strokeWidth: 2, originX: 'center', originY: 'center' });

        group = new fabric.Group([arc, line1, line2], { left: left, top: top });
    }
    else if (type === 'socket-double') {
        // Symbol: Double socket (single semicircle with two prongs), as per NCh Elec 2/84
        const arc = new fabric.Path('M -20 0 A 20 20 0 0 1 20 0', {
            fill: 'transparent', stroke: color, strokeWidth: 2, originX: 'center', originY: 'center'
        });
        const lineBase = new fabric.Line([-20, 0, 20, 0], { stroke: color, strokeWidth: 2, originX: 'center', originY: 'center' });
        const prong1 = new fabric.Line([-7, 0, -7, -10], { stroke: color, strokeWidth: 2, originX: 'center', originY: 'center', top: -5 });
        const prong2 = new fabric.Line([7, 0, 7, -10], { stroke: color, strokeWidth: 2, originX: 'center', originY: 'center', top: -5 });

        group = new fabric.Group([arc, lineBase, prong1, prong2], { left: left, top: top, originX: 'center', originY: 'center' });
    }
    else if (type === 'socket-triple') {
        // Symbol: Triple socket (single semicircle with three prongs)
        const arc = new fabric.Path('M -25 0 A 25 25 0 0 1 25 0', {
            fill: 'transparent', stroke: color, strokeWidth: 2, originX: 'center', originY: 'center'
        });
        const lineBase = new fabric.Line([-25, 0, 25, 0], { stroke: color, strokeWidth: 2, originX: 'center', originY: 'center' });
        const prong1 = new fabric.Line([-12, 0, -12, -10], { stroke: color, strokeWidth: 2, originX: 'center', originY: 'center', top: -5 });
        const prong2 = new fabric.Line([0, 0, 0, -10], { stroke: color, strokeWidth: 2, originX: 'center', originY: 'center', top: -5 });
        const prong3 = new fabric.Line([12, 0, 12, -10], { stroke: color, strokeWidth: 2, originX: 'center', originY: 'center', top: -5 });

        group = new fabric.Group([arc, lineBase, prong1, prong2, prong3], { left: left, top: top, originX: 'center', originY: 'center' });
    }
    else if (type === 'switch') {
        // Symbol: Interruptor 9/12 (Simple) - NCh Elec 2/84
        const circle = new fabric.Circle({
            radius: 6, fill: 'transparent', stroke: color, strokeWidth: 2, originX: 'center', originY: 'center'
        });
        const line = new fabric.Line([0, 0, 10, -10], { stroke: color, strokeWidth: 2, originX: 'center', originY: 'center', left: 5, top: -5 });
        
        group = new fabric.Group([circle, line], { left: left, top: top });
    }
    else if (type === 'switch-double') {
        // Symbol: Interruptor 9/15 (Doble) - NCh Elec 2/84
        const circle = new fabric.Circle({
            radius: 6, fill: 'transparent', stroke: color, strokeWidth: 2, originX: 'center', originY: 'center'
        });
        const line1 = new fabric.Line([0, 0, 10, -10], { stroke: color, strokeWidth: 2, originX: 'center', originY: 'center', left: 2, top: -8 });
        const line2 = new fabric.Line([0, 0, 10, -10], { stroke: color, strokeWidth: 2, originX: 'center', originY: 'center', left: 8, top: -2 });
        
        group = new fabric.Group([circle, line1, line2], { left: left, top: top });
    }
    else if (type === 'switch-triple') {
        // Symbol: Interruptor 9/24 (Triple) - NCh Elec 2/84
        const circle = new fabric.Circle({
            radius: 6, fill: 'transparent', stroke: color, strokeWidth: 2, originX: 'center', originY: 'center'
        });
        const line1 = new fabric.Line([0, 0, 10, -10], { stroke: color, strokeWidth: 2, originX: 'center', originY: 'center', left: -1, top: -11 });
        const line2 = new fabric.Line([0, 0, 10, -10], { stroke: color, strokeWidth: 2, originX: 'center', originY: 'center', left: 5, top: -5 });
        const line3 = new fabric.Line([0, 0, 10, -10], { stroke: color, strokeWidth: 2, originX: 'center', originY: 'center', left: 11, top: 1 });
        
        group = new fabric.Group([circle, line1, line2, line3], { left: left, top: top });
    }
    else if (type === 'switch-stair') {
        // Symbol: Interruptor 9/32 (Escalera) - Circle with a triangle
        const circle = new fabric.Circle({
            radius: 6, 
            fill: 'transparent', 
            stroke: color, 
            strokeWidth: 2, 
            originX: 'center', 
            originY: 'center'
        });
        const triangle = new fabric.Triangle({
            width: 6, height: 6, fill: color, stroke: color,
            originX: 'center', originY: 'center', top: 1 // slight offset
        });
        
        group = new fabric.Group([circle, triangle], { left: left, top: top });
    }
    else if (type === 'meter') {
        // Symbol: Medidor (Empalme) - Circle with an 'M'
        const circle = new fabric.Circle({
            radius: 15,
            fill: 'transparent',
            stroke: color,
            strokeWidth: 2,
            originX: 'center',
            originY: 'center'
        });
        const textM = new fabric.IText('M', {
            fontFamily: 'sans-serif',
            fontSize: 20,
            fill: color,
            originX: 'center',
            originY: 'center'
        });
        group = new fabric.Group([circle, textM], { left: left, top: top });
    }
    else if (type === 'tda') {
        // Symbol: Rectangle with diagonal (TDA)
        const rect = new fabric.Rect({
            width: 40, height: 25, fill: 'transparent', stroke: color, strokeWidth: 2, originX: 'center', originY: 'center'
        });
        const line = new fabric.Line([-20, -12.5, 20, 12.5], { stroke: color, strokeWidth: 2, originX: 'center', originY: 'center' });
        const fillRect = new fabric.Rect({
            width: 40, height: 25, fill: '#e2e8f0', opacity: 0.5, originX: 'center', originY: 'center'
        });

        group = new fabric.Group([fillRect, rect, line], { left: left, top: top });
    }

    if (group) {
        group.set({ hasControls: false, padding: 5 }); // Disable resize handles
        canvas.add(group);
        canvas.setActiveObject(group);
        canvas.renderAll();
    }
}

function toggleDropdown(id) {
    const dropdown = document.getElementById(id);
    if (!dropdown) return;
    
    // Close all other dropdowns
    document.querySelectorAll('.dropdown-menu').forEach(menu => {
        if (menu.id !== id) menu.classList.add('hidden');
    });

    dropdown.classList.toggle('hidden');
}

// Close dropdowns and exit sketch drawing mode when clicking outside
window.addEventListener('click', (e) => {
    // Close dropdowns
    if (!e.target.closest('.dropdown-container')) {
        document.querySelectorAll('.dropdown-menu').forEach(menu => {
            menu.classList.add('hidden');
        });
    }

    // Exit drawing mode if clicking outside the canvas area and its toolbar
    if (canvas && canvas.isDrawingMode) {
        if (!e.target.closest('#canvas-container') && !e.target.closest('#sketch-toolbar')) {
            toggleDrawingMode(currentDrawingMode);
        }
    }
});

function uploadBackground(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            fabric.Image.fromURL(e.target.result, function (img) {
                // Scale image to fit canvas if needed, or just set as background
                // For simplicity, we scale to fit width
                const scale = canvas.width / img.width;
                
                canvas.setBackgroundImage(img, () => {
                    canvas.renderAll();
                    if (!isUndoing) { saveHistory(); saveState(); }
                }, {
                    scaleX: scale,
                    scaleY: scale,
                    originX: 'left',
                    originY: 'top'
                });
            });
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function deleteSelected() {
    if (!canvas) return;
    const activeObjects = canvas.getActiveObjects();
    if (activeObjects.length) {
        canvas.discardActiveObject();
        activeObjects.forEach(function(object) {
            canvas.remove(object);
        });
    }
}

function rotateSelected(angle) {
    if (!canvas) return;
    const activeObj = canvas.getActiveObject();
    if (activeObj) {
        // Rotate relative to current angle
        activeObj.rotate((activeObj.angle || 0) + angle);
        canvas.requestRenderAll();
    }
}

function scaleSelected(factor) {
    if (!canvas) return;
    const activeObj = canvas.getActiveObject();
    if (activeObj) {
        activeObj.scaleX = (activeObj.scaleX || 1) * factor;
        activeObj.scaleY = (activeObj.scaleY || 1) * factor;
        activeObj.setCoords(); // Update hit box
        canvas.requestRenderAll();
    }
}

function downloadSketch() {
    if (!canvas) return;
    // Deselect everything to get a clean image
    canvas.discardActiveObject();
    canvas.renderAll();

    const dataURL = canvas.toDataURL({
        format: 'png',
        quality: 1
    });
    const link = document.createElement('a');
    link.download = 'plano_electrico.png';
    link.href = dataURL;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// --- State Persistence Logic ---
function saveState() {
    const loads = [];
    const tableRows = document.querySelectorAll('#load-table-body tr');
    tableRows.forEach(row => {
        loads.push({
            name: row.cells[0].innerText,
            power: parseFloat(row.cells[1].innerText.replace(' W', '')),
            wireSection: parseFloat(row.cells[2].innerText.replace(' mm²', '')),
            protection: row.cells[3].innerText,
                differential: row.cells[4].innerText
        });
    });

    const activeTabBtn = document.querySelector('.tab-active');
    const activeTabId = activeTabBtn ? activeTabBtn.id.replace('btn-', '') : 'feeder';

    const state = {
        activeTab: activeTabId,
        feeder: {
            power: document.getElementById('f-power').value,
            voltage: document.getElementById('f-voltage').value,
            fp: document.getElementById('f-fp').value,
            simultaneity: document.getElementById('f-simultaneity').value,
            length: document.getElementById('f-length').value,
            temp: document.getElementById('f-temp').value,
            group: document.getElementById('f-group').value,
        },
        conduit: {
            ductSize: document.getElementById('c-duct-size').value,
            wireSize: document.getElementById('c-wire-size').value,
            qty: document.getElementById('c-wire-qty').value,
        },
        photovoltaic: {
            panelWp: document.getElementById('pv-panel-wp').value,
            panelVoc: document.getElementById('pv-panel-voc').value,
            panelIsc: document.getElementById('pv-panel-isc').value,
            seriesCount: document.getElementById('pv-string-series').value,
            parallelCount: document.getElementById('pv-string-parallel').value,
            inverterVmax: document.getElementById('pv-inverter-volt').value,
            inverterImax: document.getElementById('pv-inverter-curr').value,
        },
        grounding: {
            resistivity: document.getElementById('g-resistivity').value,
            length: document.getElementById('g-length').value,
            diameter: document.getElementById('g-diameter').value,
        },
        loads: loads,
        sketch: {
            connectionColor: document.getElementById('connection-color-picker')?.value,
            canvasJSON: canvas ? JSON.stringify(canvas) : null
        }
    };

    localStorage.setItem('calculatorState', JSON.stringify(state));
}

function loadState() {
    const savedState = localStorage.getItem('calculatorState');
    if (!savedState) return;

    const state = JSON.parse(savedState);

    // Load Feeder
    if (state.feeder) {
        document.getElementById('f-power').value = state.feeder.power || '';
        document.getElementById('f-voltage').value = state.feeder.voltage || '220';
        document.getElementById('f-fp').value = state.feeder.fp || '0.93';
        document.getElementById('f-simultaneity').value = state.feeder.simultaneity || '1.0';
        document.getElementById('f-length').value = state.feeder.length || '';
        document.getElementById('f-temp').value = state.feeder.temp || '1.00';
        document.getElementById('f-group').value = state.feeder.group || '1.00';
        // Recalculate if there's data
        if (state.feeder.power) calculateFeeder();
    }

    // Load Conduit
    if (state.conduit) {
        document.getElementById('c-duct-size').value = state.conduit.ductSize || '16';
        document.getElementById('c-wire-size').value = state.conduit.wireSize || '1.5';
        document.getElementById('c-wire-qty').value = state.conduit.qty || '3';
        calculateConduit();
    }

    // Load Photovoltaic
    if (state.photovoltaic) {
        document.getElementById('pv-panel-wp').value = state.photovoltaic.panelWp || '450';
        document.getElementById('pv-panel-voc').value = state.photovoltaic.panelVoc || '49.5';
        document.getElementById('pv-panel-isc').value = state.photovoltaic.panelIsc || '11.6';
        document.getElementById('pv-string-series').value = state.photovoltaic.seriesCount || '8';
        document.getElementById('pv-string-parallel').value = state.photovoltaic.parallelCount || '1';
        document.getElementById('pv-inverter-volt').value = state.photovoltaic.inverterVmax || '550';
        document.getElementById('pv-inverter-curr').value = state.photovoltaic.inverterImax || '15';
        calculatePhotovoltaic();
    }


    // Load Grounding
    if (state.grounding) {
        document.getElementById('g-resistivity').value = state.grounding.resistivity || '';
        document.getElementById('g-length').value = state.grounding.length || '2.5';
        document.getElementById('g-diameter').value = state.grounding.diameter || '16';
        // Recalculate if there's data
        if (state.grounding.resistivity) calculateGrounding();
    }
    
    // Load Sketch settings
    if (state.sketch) {
        const colorPicker = document.getElementById('connection-color-picker');
        if (colorPicker && state.sketch.connectionColor) {
            colorPicker.value = state.sketch.connectionColor;
        }
        // Store canvas JSON to be loaded when the canvas is initialized
        if (state.sketch.canvasJSON) {
            savedCanvasJSON = state.sketch.canvasJSON;
        }
    }

    // Load Loads
    if (state.loads && Array.isArray(state.loads)) {
        const tbody = document.getElementById('load-table-body');
        tbody.innerHTML = ''; // Clear existing rows
        totalWatts = 0;
        state.loads.forEach(load => {
            // Usar valores seguros para evitar errores si el localStorage tiene datos corruptos (null/NaN)
            const safeName = load.name || '';
            const safePower = (typeof load.power === 'number' && !isNaN(load.power)) ? load.power : 0;
            const safeWireSection = (typeof load.wireSection === 'number' && !isNaN(load.wireSection)) ? load.wireSection : 0;
            const safeProtection = load.protection || '';
            const safeDifferential = load.differential || 'General';

            const row = document.createElement('tr');
            row.className = "border-b hover:bg-slate-50 transition dark:border-slate-700 dark:hover:bg-slate-700/50";
            row.innerHTML = `
                <td class="p-3 font-medium" contenteditable="true" onblur="saveState()">${safeName}</td>
                <td class="p-3" contenteditable="true" onfocus="editFocus(this, ' W')" onblur="editBlur(this, ' W', true)">${safePower} W</td>
                <td class="p-3" contenteditable="true" onfocus="editFocus(this, ' mm²')" onblur="editBlur(this, ' mm²')">${safeWireSection.toFixed(1)} mm²</td>
                <td class="p-3"><span class="bg-slate-200 px-2 py-1 rounded text-xs font-bold dark:bg-slate-700 dark:text-slate-300" contenteditable="true" onblur="saveState()">${safeProtection}</span></td>
                <td class="p-3"><span class="bg-slate-200 px-2 py-1 rounded text-xs font-bold dark:bg-slate-700 dark:text-slate-300" contenteditable="true" onblur="saveState()">${safeDifferential}</span></td>
                <td class="p-3 text-center">
                    <button onclick="removeRow(this)" class="text-red-500 hover:text-red-700">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
            totalWatts += safePower;
        });
        updateTotalDisplay();
    }

    // Load Active Tab
    if (state.activeTab) {
        // We need to ensure this runs after the initial render is complete
        setTimeout(() => switchTab(state.activeTab), 0);
    }
}