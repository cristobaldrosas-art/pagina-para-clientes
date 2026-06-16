// --- CONFIGURACIÓN GLOBAL ---
const WHATSAPP_PHONE = "56976034758";
const ADMIN_PASSWORD = "123Cris321";
const ADMIN_RUT = "212762539";

// --- CLIENTE SUPABASE ---
let supabaseClient = null;

// --- ESTADO DE LA APLICACIÓN ---
let vehicles = window.DEFAULT_VEHICLES ? [...window.DEFAULT_VEHICLES] : [];
let currentEditingId = null;
let selectedVehicleForEvaluation = null;
let selectedVehicleForDetails = null;
let logCurrentPage = 1;
const LOG_PAGE_SIZE = 20;
let pdfParsedVehicles = [];

// --- ELEMENTOS DOM (Se inicializarán en initApp) ---
let loginScreen, catalogScreen, loginForm, loginRutInput, loginRutError;
let vehiclesGrid, searchInput, filterType, filterTransmission, filterPrice, stockCount;
let logoutBtn, adminBtn, adminTriggerFooter;
let adminModal, adminPasswordModal, adminPasswordForm, adminPasswordInput, adminPasswordError;
let evalModal, evalForm, evalClientType, evalEmployerGroup, evalEmployer;

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  // Inicializar elementos DOM después de cargar la página
  loginScreen = document.getElementById('login-screen');
  catalogScreen = document.getElementById('catalog-screen');
  loginForm = document.getElementById('login-form');
  loginRutInput = document.getElementById('login-rut');
  loginRutError = document.getElementById('login-rut-error');

  vehiclesGrid = document.getElementById('vehicles-grid');
  searchInput = document.getElementById('search-input');
  filterType = document.getElementById('filter-type');
  filterTransmission = document.getElementById('filter-transmission');
  filterPrice = document.getElementById('filter-price');
  stockCount = document.getElementById('stock-count');

  logoutBtn = document.getElementById('logout-btn');
  adminBtn = document.getElementById('admin-btn');
  adminTriggerFooter = document.getElementById('admin-trigger-footer');

  adminModal = document.getElementById('admin-modal');
  adminPasswordModal = document.getElementById('admin-password-modal');
  adminPasswordForm = document.getElementById('admin-password-form');
  adminPasswordInput = document.getElementById('admin-password');
  adminPasswordError = document.getElementById('admin-password-error');

  evalModal = document.getElementById('eval-modal');
  evalForm = document.getElementById('eval-form');
  evalClientType = document.getElementById('eval-client-type');
  evalEmployerGroup = document.getElementById('eval-employer-group');
  evalEmployer = document.getElementById('eval-employer');

  // 1. Configurar listeners de forma inmediata para que la UI responda rápido
  setupEventListeners();
  
  // 2. Comprobar si ya está logueado para mostrar la pantalla correcta rápido
  checkAuth();

  // 3. Cargar el entorno y el stock en segundo plano de forma asíncrona
  try {
    if (window.loadEnvPromise) {
      await window.loadEnvPromise;
    }
    
    if (window.supabase && window.SUPABASE_URL && window.SUPABASE_KEY) {
      supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
    }
    
    await loadStock();
    
    // Re-renderizar catálogo y filtros una vez cargado el stock fresco de Supabase
    let authenticatedRut = null;
    try {
      authenticatedRut = localStorage.getItem('auth_rut');
    } catch (e) {}
    if (authenticatedRut || window.auth_rut_fallback) {
      renderCatalog();
      populateUniqueTypes();
    }
  } catch (err) {
    console.error("Error en la carga asíncrona de datos:", err);
    loadLocalFallback();
    let authenticatedRut = null;
    try {
      authenticatedRut = localStorage.getItem('auth_rut');
    } catch (e) {}
    if (authenticatedRut || window.auth_rut_fallback) {
      renderCatalog();
      populateUniqueTypes();
    }
  }
}

// --- AUTENTICACIÓN / RUT CHILENO ---

function checkAuth() {
  let authenticatedRut = null;
  try {
    authenticatedRut = localStorage.getItem('auth_rut');
  } catch (e) {
    authenticatedRut = window.auth_rut_fallback;
  }
  if (!authenticatedRut && window.auth_rut_fallback) {
    authenticatedRut = window.auth_rut_fallback;
  }

  if (authenticatedRut) {
    showScreen('catalog-screen');
    renderCatalog();
    populateUniqueTypes();
    
    // Controlar visibilidad del panel de administración
    const cleanAuth = cleanRUT(authenticatedRut);
    if (cleanAuth === ADMIN_RUT) {
      if (adminBtn) adminBtn.style.display = 'inline-flex';
      if (adminTriggerFooter) adminTriggerFooter.style.display = 'inline-block';
    } else {
      if (adminBtn) adminBtn.style.display = 'none';
      if (adminTriggerFooter) adminTriggerFooter.style.display = 'none';
    }
  } else {
    showScreen('login-screen');
    if (adminBtn) adminBtn.style.display = 'none';
    if (adminTriggerFooter) adminTriggerFooter.style.display = 'none';
  }
}

function cleanRUT(rut) {
  return typeof rut === 'string'
    ? rut.replace(/[^0-9kK]/g, '').toUpperCase()
    : '';
}

function calculateDV(rutBody) {
  let sum = 0;
  let multiplier = 2;
  
  for (let i = rutBody.length - 1; i >= 0; i--) {
    sum += parseInt(rutBody.charAt(i), 10) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  
  const index = 11 - (sum % 11);
  if (index === 11) return '0';
  if (index === 10) return 'K';
  return index.toString();
}

function validateRUT(rutComplete) {
  const clean = cleanRUT(rutComplete);
  if (clean.length < 2) return false;
  
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  
  // Validaciones básicas de formato/longitud (soporta RUTs antiguos de 6 a 8 dígitos en el cuerpo)
  if (body.length < 6 || body.length > 8) return false;
  
  return calculateDV(body) === dv;
}

function formatRUT(rut) {
  const clean = cleanRUT(rut).slice(0, 9); // Limitar a un máximo de 9 caracteres limpios (ej. 12345678K)
  if (clean.length === 0) return '';
  if (clean.length === 1) return clean;
  
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  
  return body + '-' + dv;
}

// --- GESTIÓN DE STOCK (SUPABASE / LOCAL FALLBACK) ---

async function loadStock() {
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('vehicles')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      
      if (data && data.length > 0) {
        vehicles = data;
      } else {
        // Si no hay datos en Supabase, inicializar con DEFAULT_VEHICLES
        vehicles = [...window.DEFAULT_VEHICLES];
        await seedDefaultVehicles();
      }
    } catch (e) {
      console.error("Error al cargar stock de Supabase, usando local:", e);
      loadLocalFallback();
    }
  } else {
    loadLocalFallback();
  }
}

function loadLocalFallback() {
  let stored = null;
  try {
    stored = localStorage.getItem('vehicles_stock');
  } catch (e) {
    console.warn("localStorage no accesible:", e);
  }
  
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        vehicles = parsed;
      } else {
        vehicles = [...window.DEFAULT_VEHICLES];
      }
    } catch (e) {
      vehicles = [...window.DEFAULT_VEHICLES];
    }
  } else {
    vehicles = [...window.DEFAULT_VEHICLES];
    saveLocalFallback();
  }
}

function saveLocalFallback() {
  try {
    localStorage.setItem('vehicles_stock', JSON.stringify(vehicles));
  } catch (e) {
    console.warn("No se pudo escribir en localStorage:", e);
  }
}

async function seedDefaultVehicles() {
  if (!supabaseClient) return;
  try {
    const { error } = await supabaseClient
      .from('vehicles')
      .insert(window.DEFAULT_VEHICLES.map(v => ({
        id: v.id,
        brand: v.brand,
        model: v.model,
        year: v.year,
        mileage: v.mileage,
        fuel: v.fuel,
        transmission: v.transmission,
        price: v.price,
        image: v.image,
        status: v.status
      })));
    if (error) console.error("Error al sembrar vehículos por defecto en Supabase:", error);
  } catch (e) {
    console.error(e);
  }
}

// --- REGISTRO DE ACCESO DE CLIENTES ---

async function registerAccess(rut) {
  if (supabaseClient) {
    try {
      const { error } = await supabaseClient
        .from('client_access')
        .insert([{ rut }]);
      if (error) console.error("Error al registrar acceso en Supabase:", error);
    } catch (e) {
      console.error("Error de conexión al registrar acceso:", e);
    }
  }
}

async function renderAccessLogs() {
  const tbody = document.querySelector('#admin-logs-table tbody');
  if (!tbody) return;
  
  if (!supabaseClient) {
    tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; color: var(--text-secondary);">Supabase no configurado. Modo local activo.</td></tr>';
    return;
  }
  
  tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; color: var(--text-secondary);">Cargando registros...</td></tr>';
  
  const prevBtn = document.getElementById('logs-prev-btn');
  const nextBtn = document.getElementById('logs-next-btn');
  const indicator = document.getElementById('logs-page-indicator');
  
  if (prevBtn) prevBtn.disabled = true;
  if (nextBtn) nextBtn.disabled = true;
  
  try {
    const from = (logCurrentPage - 1) * LOG_PAGE_SIZE;
    const to = from + LOG_PAGE_SIZE - 1;
    
    const { data, error, count } = await supabaseClient
      .from('client_access')
      .select('*', { count: 'exact' })
      .order('accessed_at', { ascending: false })
      .range(from, to);
      
    if (error) throw error;
    
    tbody.innerHTML = '';
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; color: var(--text-secondary);">No hay registros de acceso aún.</td></tr>';
      if (indicator) indicator.textContent = 'Página 0 de 0';
      return;
    }
    
    data.forEach(log => {
      const tr = document.createElement('tr');
      const date = new Date(log.accessed_at).toLocaleString('es-CL');
      tr.innerHTML = `
        <td style="font-weight: 600;">${formatRUT(log.rut)}</td>
        <td>${date}</td>
      `;
      tbody.appendChild(tr);
    });
    
    const totalPages = Math.ceil((count || 0) / LOG_PAGE_SIZE);
    
    if (indicator) {
      indicator.textContent = `Página ${logCurrentPage} de ${totalPages} (Total: ${count})`;
    }
    
    if (prevBtn) prevBtn.disabled = (logCurrentPage <= 1);
    if (nextBtn) nextBtn.disabled = (logCurrentPage >= totalPages);
    
  } catch (err) {
    console.error("Error al cargar registros de acceso:", err);
    tbody.innerHTML = `<tr><td colspan="2" style="text-align:center; color: var(--text-secondary);">Error: ${err.message}</td></tr>`;
  }
}

// --- RENDERIZADO DEL CATÁLOGO ---

function formatCLP(value) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0
  }).format(value);
}

function populateUniqueTypes() {
  // Limpiar opciones anteriores pero mantener la primera ("Todas las marcas")
  const defaultOption = filterType.options[0];
  filterType.innerHTML = '';
  filterType.appendChild(defaultOption);
  
  // Encontrar marcas únicas para filtrar
  const brands = new Set(vehicles.map(v => v.brand));
  brands.forEach(brand => {
    const opt = document.createElement('option');
    opt.value = brand;
    opt.textContent = brand;
    filterType.appendChild(opt);
  });
}

function renderCatalog() {
  const searchVal = searchInput.value.toLowerCase();
  const typeVal = filterType.value;
  const transVal = filterTransmission.value;
  const priceVal = filterPrice.value;
  
  // Filtrar vehículos
  const filtered = vehicles.filter(v => {
    const matchesSearch = 
      v.brand.toLowerCase().includes(searchVal) || 
      v.model.toLowerCase().includes(searchVal);
      
    const matchesBrand = typeVal === '' || v.brand === typeVal;
    const matchesTrans = transVal === '' || v.transmission === transVal;
    
    let matchesPrice = true;
    if (priceVal === 'under-10m') {
      matchesPrice = v.price < 10000000;
    } else if (priceVal === '10m-15m') {
      matchesPrice = v.price >= 10000000 && v.price <= 15000000;
    } else if (priceVal === 'over-15m') {
      matchesPrice = v.price > 15000000;
    }
    
    // El usuario final no debería ver vehículos vendidos en el catálogo general
    const matchesStatus = v.status !== 'vendido';
    
    return matchesSearch && matchesBrand && matchesTrans && matchesPrice && matchesStatus;
  });
  
  // Actualizar contador
  stockCount.textContent = `${filtered.length} auto${filtered.length === 1 ? '' : 's'}`;
  
  // Renderizar rejilla
  vehiclesGrid.innerHTML = '';
  
  if (filtered.length === 0) {
    vehiclesGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-secondary);">
        <svg style="width: 48px; height: 48px; fill: var(--text-muted); margin-bottom: 16px;" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
        </svg>
        <p>No encontramos vehículos que coincidan con tu búsqueda.</p>
      </div>
    `;
    return;
  }
  
  filtered.forEach(v => {
    const card = document.createElement('div');
    card.className = 'vehicle-card';
    card.style.cursor = 'pointer';
    card.onclick = (e) => {
      if (e.target.tagName === 'BUTTON') return;
      openDetailsModal(v.id);
    };
    card.innerHTML = `
      <div class="card-image-wrapper">
        <span class="status-badge ${v.status}">${v.status}</span>
        <img src="${v.image || 'placeholder.png'}" alt="${v.brand} ${v.model}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%25%22 height=%22100%25%22><rect width=%22100%25%22 height=%22100%25%22 fill=%22%231e293b%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%2394a3b8%22 font-family=%22sans-serif%22 font-size=%2218%22>Auto sin imagen</text></svg>'">
      </div>
      <div class="card-content">
        <div class="card-header-info">
          <h3 class="vehicle-title">${v.brand} ${v.model}</h3>
          <span class="vehicle-year">${v.year}</span>
        </div>
        <div class="vehicle-price">${formatCLP(v.price)}</div>
        <div class="vehicle-specs">
          <div class="spec-item">
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H7c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.04-.42 1.99-1.07 2.75z"/></svg>
            <span>${v.transmission}</span>
          </div>
          <div class="spec-item">
            <svg viewBox="0 0 24 24"><path d="M2 22h20v-2H2v2zm18-5.63V8c0-1.1-.9-2-2-2h-3v5H9V6H6c-1.1 0-2 .9-2 2v8.37c0 .82.42 1.55 1.07 1.97.28.18.61.29.93.29h12c.32 0 .65-.11.93-.29.65-.42 1.07-1.15 1.07-1.97zM12 8h2v2h-2V8zm-3 5H7v-2h2v2zm3 0h-2v-2h2v2zm3 0h-2v-2h2v2zm3 0h-2v-2h2v2z"/></svg>
            <span>${v.fuel}</span>
          </div>
          <div class="spec-item" style="grid-column: span 2;">
            <svg viewBox="0 0 24 24"><path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-1 8h-4v-4h4v4zm-6 0H9v-4h5v4zM3 10h4v4H3v-4z"/></svg>
            <span>${Number(v.mileage).toLocaleString('es-CL')} km</span>
          </div>
        </div>
        <button class="btn-card" onclick="openDetailsModal('${v.id}')">Ver Detalles</button>
      </div>
    `;
    vehiclesGrid.appendChild(card);
  });
}

// --- SISTEMA DE NAVEGACIÓN ---

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.classList.add('hidden');
  });
  
  const target = document.getElementById(screenId);
  target.classList.remove('hidden');
  target.offsetWidth;
  target.classList.add('active');
}

// --- MODAL DE DETALLES DE VEHÍCULO ---

function openDetailsModal(id) {
  const v = vehicles.find(item => item.id === id);
  if (!v) return;
  
  selectedVehicleForDetails = v;
  
  const mainImg = document.getElementById('details-main-img');
  const thumb0Img = document.getElementById('details-thumb-0');
  
  if (mainImg) mainImg.src = v.image || '';
  if (thumb0Img) thumb0Img.src = v.image || '';
  
  const slots = document.querySelectorAll('.thumb-slot');
  slots.forEach((s, idx) => {
    s.classList.toggle('active', idx === 0);
    s.style.borderColor = idx === 0 ? 'var(--accent)' : 'transparent';
    s.style.opacity = idx === 0 ? '1' : '0.6';
  });
  
  document.getElementById('details-info-brand-model').textContent = `${v.brand} ${v.model}`;
  document.getElementById('details-info-price').textContent = formatCLP(v.price);
  document.getElementById('details-info-year').textContent = v.year;
  document.getElementById('details-info-mileage').textContent = `${Number(v.mileage).toLocaleString('es-CL')} km`;
  document.getElementById('details-info-transmission').textContent = v.transmission;
  document.getElementById('details-info-fuel').textContent = v.fuel;
  
  const evalBtn = document.getElementById('details-eval-btn');
  if (evalBtn) {
    evalBtn.onclick = () => {
      closeModal('details-modal');
      openEvaluationModal(v.id);
    };
  }
  
  const waBtn = document.getElementById('details-wa-btn');
  if (waBtn) {
    waBtn.onclick = () => {
      let message = `Hola! Me interesa solicitar información adicional del vehículo *${v.brand} ${v.model} (${v.year})* anunciado en Egaña Automotriz. ¿Me podrían compartir más imágenes o detalles?`;
      const encodedMessage = encodeURIComponent(message);
      const whatsappUrl = `https://wa.me/${WHATSAPP_PHONE}?text=${encodedMessage}`;
      window.open(whatsappUrl, '_blank');
    };
  }
  
  openModal('details-modal');
}

function changeDetailsImage(index) {
  if (!selectedVehicleForDetails) return;
  
  const mainImg = document.getElementById('details-main-img');
  if (!mainImg) return;
  
  const lateralSVG = `data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%25%22 height=%22100%25%22><rect width=%22100%25%22 height=%22100%25%22 fill=%22%23121417%22/><text x=%2250%25%22 y=%2245%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23f5be18%22 font-family=%22Outfit%22 font-size=%2218%22 font-weight=%22bold%22>Vista Lateral</text><text x=%2250%25%22 y=%2260%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%2394a3b8%22 font-family=%22Outfit%22 font-size=%2212%22>Solicita fotos reales por WhatsApp</text></svg>`;
  const interiorSVG = `data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%25%22 height=%22100%25%22><rect width=%22100%25%22 height=%22100%25%22 fill=%22%23121417%22/><text x=%2250%25%22 y=%2245%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23f5be18%22 font-family=%22Outfit%22 font-size=%2218%22 font-weight=%22bold%22>Vista Interior</text><text x=%2250%25%22 y=%2260%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%2394a3b8%22 font-family=%22Outfit%22 font-size=%2212%22>Solicita fotos reales por WhatsApp</text></svg>`;
  
  if (index === 0) {
    mainImg.src = selectedVehicleForDetails.image || '';
  } else if (index === 1) {
    mainImg.src = lateralSVG;
  } else if (index === 2) {
    mainImg.src = interiorSVG;
  }
  
  const slots = document.querySelectorAll('.thumb-slot');
  slots.forEach((s, idx) => {
    s.classList.toggle('active', idx === index);
    s.style.borderColor = idx === index ? 'var(--accent)' : 'transparent';
    s.style.opacity = idx === index ? '1' : '0.6';
  });
}

// --- MODAL DE SOLICITUD DE EVALUACIÓN ---

function openEvaluationModal(vehicleId) {
  selectedVehicleForEvaluation = vehicles.find(v => v.id === vehicleId);
  if (!selectedVehicleForEvaluation) return;
  
  document.getElementById('modal-vehicle-thumb').src = selectedVehicleForEvaluation.image || '';
  document.getElementById('modal-vehicle-title').textContent = `${selectedVehicleForEvaluation.brand} ${selectedVehicleForEvaluation.model}`;
  document.getElementById('modal-vehicle-price').textContent = formatCLP(selectedVehicleForEvaluation.price);
  
  evalForm.reset();
  
  const clientRut = localStorage.getItem('auth_rut');
  document.getElementById('eval-rut').value = clientRut ? formatRUT(clientRut) : '';
  
  openModal('eval-modal');
  toggleEmployerField();
}

function toggleEmployerField() {
  if (evalClientType.value === 'dependiente') {
    evalEmployerGroup.style.display = 'block';
    evalEmployer.setAttribute('required', 'required');
  } else {
    evalEmployerGroup.style.display = 'none';
    evalEmployer.removeAttribute('required');
  }
}

// --- FORMATEADOR DE CURRENCY EN TIEMPO REAL ---

function setupCurrencyFormatter(inputElement) {
  inputElement.addEventListener('input', (e) => {
    let value = e.target.value.replace(/[^0-9]/g, '');
    if (value) {
      e.target.value = formatCLP(Number(value));
    } else {
      e.target.value = '';
    }
  });
}

// --- PANEL DE ADMINISTRACIÓN (CRUD CON SUPABASE) ---

function openAdminPasswordModal(fromLogin = false) {
  if (fromLogin !== true) {
    let authenticatedRut = null;
    try {
      authenticatedRut = localStorage.getItem('auth_rut');
    } catch (e) {
      authenticatedRut = window.auth_rut_fallback;
    }
    if (!authenticatedRut && window.auth_rut_fallback) {
      authenticatedRut = window.auth_rut_fallback;
    }
    
    if (cleanRUT(authenticatedRut) !== ADMIN_RUT) {
      alert('Acceso no autorizado. Este panel es exclusivo para el RUT del administrador.');
      return;
    }
  }
  
  adminPasswordInput.value = '';
  adminPasswordError.style.display = 'none';
  openModal('admin-password-modal');
  adminPasswordInput.focus();
}

function verifyAdminPassword(e) {
  e.preventDefault();
  let authenticatedRut = null;
  try {
    authenticatedRut = localStorage.getItem('auth_rut');
  } catch (e) {
    authenticatedRut = window.auth_rut_fallback;
  }
  if (!authenticatedRut && window.auth_rut_fallback) {
    authenticatedRut = window.auth_rut_fallback;
  }
  
  let isLoggingIn = false;
  const loginRutClean = cleanRUT(loginRutInput ? loginRutInput.value : '');
  if (loginRutClean === ADMIN_RUT && (!authenticatedRut || cleanRUT(authenticatedRut) !== ADMIN_RUT)) {
    isLoggingIn = true;
  }
  
  if (!isLoggingIn && cleanRUT(authenticatedRut) !== ADMIN_RUT) {
    adminPasswordError.style.display = 'block';
    adminPasswordError.textContent = 'RUT no autorizado';
    return;
  }
  
  if (adminPasswordInput.value === ADMIN_PASSWORD) {
    closeModal('admin-password-modal');
    
    if (isLoggingIn) {
      try {
        localStorage.setItem('auth_rut', ADMIN_RUT);
      } catch (err) {}
      window.auth_rut_fallback = ADMIN_RUT;
      
      registerAccess(ADMIN_RUT);
      checkAuth();
      openAdminDashboard();
    } else {
      openAdminDashboard();
    }
  } else {
    adminPasswordError.style.display = 'block';
    adminPasswordError.textContent = 'Contraseña incorrecta';
  }
}

function openAdminDashboard() {
  currentEditingId = null;
  resetAdminForm();
  renderAdminTable();
  renderAccessLogs();
  openModal('admin-modal');
}

function switchAdminTab(tabName) {
  document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  
  document.querySelectorAll('.admin-tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `admin-tab-${tabName}`);
  });
  
  if (tabName === 'logs') {
    logCurrentPage = 1;
    renderAccessLogs();
  }
}

function renderAdminTable() {
  const tbody = document.querySelector('#admin-table tbody');
  tbody.innerHTML = '';
  
  vehicles.forEach(v => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><img src="${v.image || ''}" class="admin-thumb" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2250%22 height=%2235%22><rect width=%22100%25%22 height=%22100%25%22 fill=%22%231e293b%22/></svg>'"></td>
      <td style="font-weight: 600;">${v.brand} ${v.model}</td>
      <td>${v.year}</td>
      <td>${formatCLP(v.price)}</td>
      <td><span class="status-badge ${v.status}">${v.status}</span></td>
      <td>
        <div class="admin-actions">
          <button class="btn-icon edit" onclick="editVehicle('${v.id}')" title="Editar">
            <svg style="width:14px;height:14px;fill:currentColor" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          </button>
          <button class="btn-icon delete" onclick="deleteVehicle('${v.id}')" title="Eliminar">
            <svg style="width:14px;height:14px;fill:currentColor" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function resetAdminForm() {
  document.getElementById('admin-vehicle-form').reset();
  currentEditingId = null;
  document.getElementById('admin-form-title').textContent = 'Agregar Nuevo Vehículo';
  document.getElementById('admin-submit-btn').textContent = 'Agregar Vehículo';
  document.getElementById('admin-image-preview').innerHTML = '<span class="placeholder">Formatos: JPG, PNG. Se redimensionará automáticamente.</span>';
  document.getElementById('admin-image-data').value = '';
}

function handleImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const previewContainer = document.getElementById('admin-image-preview');
  previewContainer.innerHTML = '<span class="placeholder">Procesando imagen...</span>';
  
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = (event) => {
    const img = new Image();
    img.src = event.target.result;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 600;
      const MAX_HEIGHT = 450;
      let width = img.width;
      let height = img.height;
      
      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
      
      document.getElementById('admin-image-data').value = compressedDataUrl;
      previewContainer.innerHTML = `<img src="${compressedDataUrl}" alt="Vista previa">`;
    };
  };
}

async function saveVehicle(e) {
  e.preventDefault();
  
  const brand = document.getElementById('admin-brand').value.trim();
  const model = document.getElementById('admin-model').value.trim();
  const year = parseInt(document.getElementById('admin-year').value);
  const mileage = parseInt(document.getElementById('admin-mileage').value);
  const fuel = document.getElementById('admin-fuel').value;
  const transmission = document.getElementById('admin-transmission').value;
  const status = document.getElementById('admin-status').value;
  const priceRaw = document.getElementById('admin-price').value.replace(/[^0-9]/g, '');
  const price = parseInt(priceRaw);
  const imageData = document.getElementById('admin-image-data').value;
  
  if (!price || price <= 0) {
    alert('Por favor ingrese un precio válido.');
    return;
  }
  
  const submitBtn = document.getElementById('admin-submit-btn');
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Guardando...';
  submitBtn.disabled = true;

  try {
    let vehicleData = {};
    if (currentEditingId) {
      // Modo Edición
      const existing = vehicles.find(v => v.id === currentEditingId);
      vehicleData = {
        brand,
        model,
        year,
        mileage,
        fuel,
        transmission,
        price,
        status,
        image: imageData || (existing ? existing.image : '')
      };

      if (supabaseClient) {
        const { error } = await supabaseClient
          .from('vehicles')
          .update(vehicleData)
          .eq('id', currentEditingId);
        if (error) throw error;
      } else {
        const index = vehicles.findIndex(v => v.id === currentEditingId);
        if (index !== -1) {
          vehicles[index] = { ...vehicles[index], ...vehicleData };
          saveLocalFallback();
        }
      }
    } else {
      // Modo Creación
      const id = 'v_' + Date.now();
      vehicleData = {
        id,
        brand,
        model,
        year,
        mileage,
        fuel,
        transmission,
        price,
        status,
        image: imageData || 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%25%22 height=%22100%25%22><rect width=%22100%25%22 height=%22100%25%22 fill=%22%231e293b%22/></svg>'
      };

      if (supabaseClient) {
        const { error } = await supabaseClient
          .from('vehicles')
          .insert([vehicleData]);
        if (error) throw error;
      } else {
        vehicles.push(vehicleData);
        saveLocalFallback();
      }
    }

    await loadStock();
    renderCatalog();
    populateUniqueTypes();
    renderAdminTable();
    resetAdminForm();
    switchAdminTab('stock');
  } catch (err) {
    console.error("Error al guardar vehículo:", err);
    alert("Ocurrió un error al guardar en la base de datos: " + err.message);
  } finally {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
}

function editVehicle(id) {
  const v = vehicles.find(item => item.id === id);
  if (!v) return;
  
  currentEditingId = v.id;
  
  document.getElementById('admin-brand').value = v.brand;
  document.getElementById('admin-model').value = v.model;
  document.getElementById('admin-year').value = v.year;
  document.getElementById('admin-mileage').value = v.mileage;
  document.getElementById('admin-fuel').value = v.fuel;
  document.getElementById('admin-transmission').value = v.transmission;
  document.getElementById('admin-status').value = v.status;
  document.getElementById('admin-price').value = formatCLP(v.price);
  document.getElementById('admin-image-data').value = v.image;
  
  document.getElementById('admin-form-title').textContent = `Editar: ${v.brand} ${v.model}`;
  document.getElementById('admin-submit-btn').textContent = 'Guardar Cambios';
  
  const previewContainer = document.getElementById('admin-image-preview');
  if (v.image) {
    previewContainer.innerHTML = `<img src="${v.image}" alt="Vista previa">`;
  } else {
    previewContainer.innerHTML = '<span class="placeholder">Auto sin imagen.</span>';
  }
  
  switchAdminTab('form');
}

async function deleteVehicle(id) {
  if (confirm('¿Estás seguro de que deseas eliminar este vehículo de tu stock?')) {
    if (supabaseClient) {
      try {
        const { error } = await supabaseClient
          .from('vehicles')
          .delete()
          .eq('id', id);
        if (error) throw error;
        await loadStock();
      } catch (err) {
        console.error("Error al eliminar vehículo de Supabase:", err);
        alert("Error al eliminar de la base de datos: " + err.message);
        return;
      }
    } else {
      vehicles = vehicles.filter(v => v.id !== id);
      saveLocalFallback();
    }
    renderCatalog();
    populateUniqueTypes();
    renderAdminTable();
  }
}

// Exportar e Importar base de datos
function exportDatabase() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(vehicles, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `stock_vehiculos_${new Date().toISOString().slice(0,10)}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

async function importDatabase(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.readAsText(file);
  reader.onload = async (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      if (Array.isArray(parsed)) {
        if (confirm(`Se detectaron ${parsed.length} vehículos. ¿Deseas reemplazar tu stock en la base de datos con este archivo?`)) {
          if (supabaseClient) {
            // Eliminar existentes
            const { error: delError } = await supabaseClient.from('vehicles').delete().neq('id', 'dummy_id_to_clear');
            if (delError) throw delError;
            
            // Insertar nuevos
            const cleanedData = parsed.map(({ id, brand, model, year, mileage, fuel, transmission, price, image, status }) => ({
              id, brand, model, year, mileage, fuel, transmission, price, image, status
            }));
            
            const { error: insError } = await supabaseClient.from('vehicles').insert(cleanedData);
            if (insError) throw insError;
          } else {
            vehicles = parsed;
            saveLocalFallback();
          }
          await loadStock();
          renderCatalog();
          populateUniqueTypes();
          renderAdminTable();
          alert('Stock importado con éxito.');
        }
      } else {
        alert('El archivo JSON no tiene un formato válido.');
      }
    } catch (err) {
      console.error(err);
      alert('Error al importar base de datos: ' + err.message);
    }
  };
  e.target.value = '';
}

// --- MODALES FUNCIONES GENERALES ---

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  modal.classList.add('active');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  modal.classList.remove('active');
}

// --- CONFIGURACIÓN DE EVENT LISTENERS ---

function setupEventListeners() {
  // Login
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const rutVal = loginRutInput.value;
    if (validateRUT(rutVal)) {
      loginRutError.style.display = 'none';
      const cleaned = cleanRUT(rutVal);
      if (cleaned === ADMIN_RUT) {
        // Si es el RUT del administrador, pedir clave de inmediato
        openAdminPasswordModal(true);
      } else {
        try {
          localStorage.setItem('auth_rut', cleaned);
        } catch (e) {}
        window.auth_rut_fallback = cleaned;
        
        // Registrar acceso asíncronamente (sin bloquear al usuario)
        registerAccess(cleaned);
        
        checkAuth();
      }
    } else {
      const clean = cleanRUT(rutVal);
      let errorMsg = 'RUT inválido. Formato esperado: 12345678-K';
      
      if (clean.length >= 2) {
        const body = clean.slice(0, -1);
        const typedDv = clean.slice(-1);
        const expectedDv = calculateDV(body);
        
        if (body.length >= 6 && body.length <= 8) {
          errorMsg = `RUT incorrecto. Para el cuerpo "${body}", el dígito verificador debe ser "${expectedDv}". Tú ingresaste "${typedDv}".`;
        }
      }
      
      loginRutError.style.display = 'block';
      loginRutError.textContent = errorMsg;
    }
  });
  
  // Dar formato de RUT en el login mientras escribe
  loginRutInput.addEventListener('input', (e) => {
    const value = e.target.value;
    const formatted = formatRUT(value);
    e.target.value = formatted;
  });
  
  // Logout
  logoutBtn.addEventListener('click', () => {
    try {
      localStorage.removeItem('auth_rut');
    } catch (e) {}
    window.auth_rut_fallback = null;
    showScreen('login-screen');
  });
  
  // Filtros de búsqueda
  searchInput.addEventListener('input', renderCatalog);
  filterType.addEventListener('change', renderCatalog);
  filterTransmission.addEventListener('change', renderCatalog);
  filterPrice.addEventListener('change', renderCatalog);
  
  // Disparar modales admin
  adminBtn.addEventListener('click', () => openAdminPasswordModal(false));
  adminTriggerFooter.addEventListener('click', () => openAdminPasswordModal(false));
  
  // Modal de contraseña admin
  adminPasswordForm.addEventListener('submit', verifyAdminPassword);
  
  // Admin form submission (delegado para control asíncrono)
  document.getElementById('admin-vehicle-form').addEventListener('submit', saveVehicle);
  document.getElementById('admin-image').addEventListener('change', handleImageUpload);
  
  // WhatsApp Form
  evalClientType.addEventListener('change', toggleEmployerField);
  
  // Formateadores monetarios
  setupCurrencyFormatter(document.getElementById('eval-salary'));
  setupCurrencyFormatter(document.getElementById('eval-down-payment'));
  setupCurrencyFormatter(document.getElementById('admin-price'));
  
  // Formatear RUT del modal de WhatsApp
  document.getElementById('eval-rut').addEventListener('input', (e) => {
    e.target.value = formatRUT(e.target.value);
  });
  
  // Cierre de modales al hacer clic fuera o en la cruz
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal(modal.id);
      }
    });
  });
  
  document.querySelectorAll('.modal-close').forEach(closeBtn => {
    closeBtn.addEventListener('click', () => {
      const modal = closeBtn.closest('.modal-overlay');
      if (modal) closeModal(modal.id);
    });
  });
  
  // Formulario de WhatsApp enviar
  evalForm.addEventListener('submit', sendWhatsAppRequest);
  
  // Paginación de registros de acceso
  const logsPrevBtn = document.getElementById('logs-prev-btn');
  const logsNextBtn = document.getElementById('logs-next-btn');
  if (logsPrevBtn) {
    logsPrevBtn.addEventListener('click', () => {
      if (logCurrentPage > 1) {
        logCurrentPage--;
        renderAccessLogs();
      }
    });
  }
  if (logsNextBtn) {
    logsNextBtn.addEventListener('click', () => {
      logCurrentPage++;
      renderAccessLogs();
    });
  }
}

function sendWhatsAppRequest(e) {
  e.preventDefault();
  
  const name = document.getElementById('eval-name').value.trim();
  const rut = document.getElementById('eval-rut').value.trim();
  const clientType = evalClientType.options[evalClientType.selectedIndex].text;
  const salary = document.getElementById('eval-salary').value.trim();
  const employer = evalEmployer.value.trim();
  const downPayment = document.getElementById('eval-down-payment').value.trim();
  
  if (!validateRUT(rut)) {
    alert('Por favor ingrese un RUT de cliente válido.');
    return;
  }
  
  if (!selectedVehicleForEvaluation) {
    alert('Error: Ningún vehículo seleccionado.');
    return;
  }
  
  let message = `Hola! Me interesa solicitar la evaluación para la compra de un vehículo en *Egaña Automotriz*:\n\n`;
  message += `*Vehículo de Interés:*\n`;
  message += `🚗 *Modelo:* ${selectedVehicleForEvaluation.brand} ${selectedVehicleForEvaluation.model}\n`;
  message += `📅 *Año:* ${selectedVehicleForEvaluation.year}\n`;
  message += `💰 *Precio:* ${formatCLP(selectedVehicleForEvaluation.price)}\n\n`;
  
  message += `*Datos de la Evaluación:*\n`;
  message += `👤 *Nombre:* ${name}\n`;
  message += `💳 *RUT:* ${rut}\n`;
  message += `💼 *Tipo de Cliente:* ${clientType}\n`;
  message += `💵 *Sueldo Líquido:* ${salary}\n`;
  
  if (evalClientType.value === 'dependiente') {
    message += `🏢 *Empleador:* ${employer}\n`;
  }
  
  message += `🪙 *Pie Disponible:* ${downPayment || '$0'}\n\n`;
  message += `Quedo atento a tus comentarios para evaluar la factibilidad del crédito. ¡Gracias!`;
  
  const encodedMessage = encodeURIComponent(message);
  const whatsappUrl = `https://wa.me/${WHATSAPP_PHONE}?text=${encodedMessage}`;
  window.open(whatsappUrl, '_blank');
  closeModal('eval-modal');
}

// --- FUNCIONES PARA LA IMPORTACIÓN DESDE PDF ---

async function importFromPDF(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const clearInput = () => { e.target.value = ''; };

  const reader = new FileReader();
  reader.readAsArrayBuffer(file);
  reader.onload = async (event) => {
    try {
      const arrayBuffer = event.target.result;
      
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      
      let text = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        text += pageText + '\n';
      }
      
      pdfParsedVehicles = parseCarPDFText(text);
      
      if (pdfParsedVehicles.length === 0) {
        alert('No se encontraron vehículos válidos en el PDF. Asegúrate de que contenga nombres de marcas conocidas y precios.');
        clearInput();
        return;
      }
      
      openModal('pdf-preview-modal');
      renderPDFPreviewTable();
    } catch (err) {
      console.error("Error al procesar PDF:", err);
      alert("Error al procesar el archivo PDF: " + err.message);
    } finally {
      clearInput();
    }
  };
}

function parseCarPDFText(text) {
  const brands = [
    'Toyota', 'Hyundai', 'Suzuki', 'Mazda', 'Chevrolet', 'Ford', 'Nissan', 'Kia',
    'Peugeot', 'Mitsubishi', 'Honda', 'Subaru', 'Volkswagen', 'Fiat', 'Citroen',
    'Chery', 'MG', 'BMW', 'Mercedes-Benz', 'Mercedes', 'Audi', 'Lexus', 'Volvo', 
    'Jeep', 'Dodge', 'RAM', 'SsangYong', 'Mahindra', 'Renault', 'Opel', 'Changan', 
    'Great Wall', 'GWM', 'JAC', 'DFSK', 'Maxus', 'Foton', 'BAIC', 'JMC', 'Jetour', 'Geely'
  ];

  const matches = [];
  const lowerText = text.toLowerCase();
  
  brands.forEach(brand => {
    const brandLower = brand.toLowerCase();
    let idx = lowerText.indexOf(brandLower);
    while (idx !== -1) {
      matches.push({ brand, index: idx });
      idx = lowerText.indexOf(brandLower, idx + brandLower.length);
    }
  });

  matches.sort((a, b) => a.index - b.index);

  const parsedVehicles = [];

  if (matches.length > 0) {
    for (let i = 0; i < matches.length; i++) {
      const currentMatch = matches[i];
      const startIdx = currentMatch.index;
      const endIdx = (i + 1 < matches.length) ? matches[i + 1].index : text.length;
      
      const blockText = text.substring(startIdx, endIdx);
      const vehicle = parseVehicleBlock(blockText, currentMatch.brand);
      if (vehicle) {
        parsedVehicles.push(vehicle);
      }
    }
  } else {
    // Fallback: split by lines and parse if they seem to contain car info
    const lines = text.split('\n');
    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed.length > 10) {
        const yearMatch = trimmed.match(/\b(199\d|20[0-2]\d)\b/);
        if (yearMatch) {
          let detectedBrand = 'Otros';
          for (let b of brands) {
            if (trimmed.toLowerCase().includes(b.toLowerCase())) {
              detectedBrand = b;
              break;
            }
          }
          const vehicle = parseVehicleBlock(trimmed, detectedBrand);
          if (vehicle) {
            parsedVehicles.push(vehicle);
          }
        }
      }
    });
  }

  return parsedVehicles;
}

function parseVehicleBlock(blockText, brand) {
  // 1. Year
  let year = new Date().getFullYear();
  const yearMatches = [...blockText.matchAll(/\b(199\d|20[0-2]\d)\b/g)];
  if (yearMatches.length > 0) {
    year = parseInt(yearMatches[0][1]);
  }

  // 2. Kilometraje (Mileage)
  let mileage = 0;
  const mileageRegex = /(\b\d{1,3}(?:\.\d{3})*|\b\d+)\s*(?:km|kms|kilometro|kilómetro|kilometros|kilómetros)\b/i;
  const mileageMatch = blockText.match(mileageRegex);
  if (mileageMatch) {
    mileage = parseInt(mileageMatch[1].replace(/\./g, ''));
  }

  // 3. Price
  let price = 0;
  const priceRegexes = [
    /\$\s*(\d{1,3}(?:\.\d{3})+|\d{6,9})\b/, // With $
    /\b(\d{1,3}(?:\.\d{3}){2})\b/, // E.g. 18.990.000
    /\b(\d{7,9})\b/ // E.g. 18990000
  ];

  let priceFound = false;
  for (let regex of priceRegexes) {
    const match = blockText.match(regex);
    if (match) {
      const val = parseInt(match[1].replace(/\./g, ''));
      if (val >= 500000 && val <= 200000000) {
        price = val;
        priceFound = true;
        break;
      }
    }
  }

  // If mileage is still 0, look for other numbers that could be mileage
  if (mileage === 0) {
    let cleanTextForMileage = blockText;
    if (priceFound) {
      cleanTextForMileage = cleanTextForMileage.replace(price.toString(), '');
      const dottedPrice = price.toLocaleString('es-CL');
      cleanTextForMileage = cleanTextForMileage.replace(dottedPrice, '');
    }
    cleanTextForMileage = cleanTextForMileage.replace(year.toString(), '');
    
    const numberMatches = cleanTextForMileage.match(/\b\d{1,3}(?:\.\d{3})*\b/g);
    if (numberMatches) {
      for (let numStr of numberMatches) {
        const val = parseInt(numStr.replace(/\./g, ''));
        if (val > 0 && val < 500000) {
          mileage = val;
          break;
        }
      }
    }
  }

  // 4. Transmission
  let transmission = 'Manual';
  if (/\b(automatica|automática|aut|auto|at)\b/i.test(blockText)) {
    transmission = 'Automática';
  } else if (/\b(manual|mecanica|mecánica|mec|mt)\b/i.test(blockText)) {
    transmission = 'Manual';
  }

  // 5. Fuel
  let fuel = 'Bencina';
  if (/\b(diesel|diésel|petroleo|petróleo)\b/i.test(blockText)) {
    fuel = 'Diésel';
  } else if (/\b(hibrido|híbrido|hybrid)\b/i.test(blockText)) {
    fuel = 'Híbrido';
  } else if (/\b(electrico|eléctrico|electric|ev)\b/i.test(blockText)) {
    fuel = 'Eléctrico';
  }

  // 6. Model
  let brandPos = blockText.indexOf(brand);
  if (brandPos === -1) {
    brandPos = blockText.toLowerCase().indexOf(brand.toLowerCase());
  }
  
  let modelStart = brandPos + brand.length;
  let modelPart = blockText.substring(modelStart).trim();

  modelPart = modelPart.split('\n')[0];

  let limitIdx = modelPart.length;

  const yearMatch = modelPart.match(/\b(199\d|20[0-2]\d)\b/);
  if (yearMatch && yearMatch.index < limitIdx) {
    limitIdx = yearMatch.index;
  }

  const priceMatch = modelPart.match(/\$/);
  if (priceMatch && priceMatch.index < limitIdx) {
    limitIdx = priceMatch.index;
  }

  const kmMatch = modelPart.match(/\b\d+\s*kms?\b/i);
  if (kmMatch && kmMatch.index < limitIdx) {
    limitIdx = kmMatch.index;
  }

  const specTerms = [/\bmanual\b/i, /\bautomática\b/i, /\bautomatica\b/i, /\bdiesel\b/i, /\bdiésel\b/i, /\bbencina\b/i];
  for (let term of specTerms) {
    const m = modelPart.match(term);
    if (m && m.index < limitIdx) {
      limitIdx = m.index;
    }
  }

  let model = modelPart.substring(0, limitIdx).trim();
  model = model.replace(/^[:\-\s,]+|[:\-\s,]+$/g, '');

  if (!model) {
    const words = modelPart.split(/\s+/).slice(0, 3).join(' ');
    model = words || 'Modelo Desconocido';
  }

  if (model.length > 50) {
    model = model.substring(0, 50).trim() + '...';
  }

  return {
    brand,
    model,
    year: year || new Date().getFullYear(),
    mileage: mileage || 0,
    transmission,
    fuel,
    price: price || 0,
    status: 'disponible'
  };
}

function renderPDFPreviewTable() {
  const tbody = document.querySelector('#pdf-preview-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  if (pdfParsedVehicles.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">
          No se detectaron vehículos válidos en el PDF.
        </td>
      </tr>
    `;
    return;
  }
  
  pdfParsedVehicles.forEach((v, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <input type="checkbox" class="pdf-row-checkbox" data-index="${index}" checked>
      </td>
      <td>
        <strong>${v.brand}</strong> ${v.model}
      </td>
      <td>${v.year}</td>
      <td>${formatCLP(v.price)}</td>
      <td>${v.mileage.toLocaleString('es-CL')} KM</td>
      <td>
        <span style="font-size: 0.75rem; background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px; margin-right: 4px;">${v.transmission}</span>
        <span style="font-size: 0.75rem; background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px;">${v.fuel}</span>
      </td>
    `;
    tbody.appendChild(tr);
  });
  
  // Set master checkbox to checked
  const master = document.getElementById('pdf-select-all');
  if (master) master.checked = true;
}

function toggleSelectAllPDF(master) {
  const checkboxes = document.querySelectorAll('.pdf-row-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = master.checked;
  });
}

async function confirmPDFImport() {
  const checkboxes = document.querySelectorAll('.pdf-row-checkbox');
  const selectedVehicles = [];
  
  checkboxes.forEach(cb => {
    if (cb.checked) {
      const idx = parseInt(cb.getAttribute('data-index'));
      selectedVehicles.push(pdfParsedVehicles[idx]);
    }
  });
  
  if (selectedVehicles.length === 0) {
    alert('Por favor selecciona al menos un vehículo para importar.');
    return;
  }
  
  const confirmBtn = document.getElementById('pdf-confirm-btn');
  const originalText = confirmBtn.textContent;
  confirmBtn.textContent = 'Importando...';
  confirmBtn.disabled = true;
  
  try {
    for (let v of selectedVehicles) {
      const id = 'v_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      const vehicleData = {
        id,
        brand: v.brand,
        model: v.model,
        year: v.year,
        mileage: v.mileage,
        fuel: v.fuel,
        transmission: v.transmission,
        price: v.price,
        status: 'disponible',
        image: 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%25%22 height=%22100%25%22><rect width=%22100%25%22 height=%22100%25%22 fill=%22%231e293b%22/></svg>'
      };
      
      if (supabaseClient) {
        const { error } = await supabaseClient
          .from('vehicles')
          .insert([vehicleData]);
        if (error) throw error;
      } else {
        vehicles.push(vehicleData);
      }
    }
    
    if (!supabaseClient) {
      saveLocalFallback();
    }
    
    await loadStock();
    renderCatalog();
    populateUniqueTypes();
    renderAdminTable();
    
    closeModal('pdf-preview-modal');
    alert(`Se importaron con éxito ${selectedVehicles.length} vehículos.`);
  } catch (err) {
    console.error("Error al importar desde PDF:", err);
    alert("Error al guardar en la base de datos: " + err.message);
  } finally {
    confirmBtn.textContent = originalText;
    confirmBtn.disabled = false;
  }
}
