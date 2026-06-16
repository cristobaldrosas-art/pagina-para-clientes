// --- CONFIGURACIÓN GLOBAL ---
const WHATSAPP_PHONE = "56976034758";
const ADMIN_PASSWORD = "admin123";

// --- CLIENTE SUPABASE ---
let supabase = null;

// --- ESTADO DE LA APLICACIÓN ---
let vehicles = [];
let currentEditingId = null;
let selectedVehicleForEvaluation = null;

// Elementos DOM
const loginScreen = document.getElementById('login-screen');
const catalogScreen = document.getElementById('catalog-screen');
const loginForm = document.getElementById('login-form');
const loginRutInput = document.getElementById('login-rut');
const loginRutError = document.getElementById('login-rut-error');

const vehiclesGrid = document.getElementById('vehicles-grid');
const searchInput = document.getElementById('search-input');
const filterType = document.getElementById('filter-type');
const filterTransmission = document.getElementById('filter-transmission');
const filterPrice = document.getElementById('filter-price');
const stockCount = document.getElementById('stock-count');

const logoutBtn = document.getElementById('logout-btn');
const adminBtn = document.getElementById('admin-btn');
const adminTriggerFooter = document.getElementById('admin-trigger-footer');

// Modales
const adminModal = document.getElementById('admin-modal');
const adminPasswordModal = document.getElementById('admin-password-modal');
const adminPasswordForm = document.getElementById('admin-password-form');
const adminPasswordInput = document.getElementById('admin-password');
const adminPasswordError = document.getElementById('admin-password-error');

const evalModal = document.getElementById('eval-modal');
const evalForm = document.getElementById('eval-form');
const evalClientType = document.getElementById('eval-client-type');
const evalEmployerGroup = document.getElementById('eval-employer-group');
const evalEmployer = document.getElementById('eval-employer');

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  // Esperar a que se cargue el archivo .env si la promesa existe
  if (window.loadEnvPromise) {
    await window.loadEnvPromise;
  }

  // Inicializar cliente de Supabase
  if (window.supabase && window.SUPABASE_URL && window.SUPABASE_KEY) {
    supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
  }

  await loadStock();
  setupEventListeners();
  checkAuth();
}

// --- AUTENTICACIÓN / RUT CHILENO ---

function checkAuth() {
  const authenticatedRut = localStorage.getItem('auth_rut');
  if (authenticatedRut) {
    showScreen('catalog-screen');
    renderCatalog();
    populateUniqueTypes();
  } else {
    showScreen('login-screen');
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
  
  // Validaciones básicas de formato/longitud
  if (body.length < 7 || body.length > 8) return false;
  
  return calculateDV(body) === dv;
}

function formatRUT(rut) {
  const clean = cleanRUT(rut);
  if (clean.length === 0) return '';
  if (clean.length === 1) return clean;
  
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  
  let formatted = '';
  let count = 0;
  for (let i = body.length - 1; i >= 0; i--) {
    formatted = body.charAt(i) + formatted;
    count++;
    if (count % 3 === 0 && i !== 0) {
      formatted = '.' + formatted;
    }
  }
  
  return formatted + '-' + dv;
}

// --- GESTIÓN DE STOCK (SUPABASE / LOCAL FALLBACK) ---

async function loadStock() {
  if (supabase) {
    try {
      const { data, error } = await supabase
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
  const stored = localStorage.getItem('vehicles_stock');
  if (stored) {
    try {
      vehicles = JSON.parse(stored);
    } catch (e) {
      vehicles = [...window.DEFAULT_VEHICLES];
    }
  } else {
    vehicles = [...window.DEFAULT_VEHICLES];
    saveLocalFallback();
  }
}

function saveLocalFallback() {
  localStorage.setItem('vehicles_stock', JSON.stringify(vehicles));
}

async function seedDefaultVehicles() {
  if (!supabase) return;
  try {
    const { error } = await supabase
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
        <button class="btn-card" onclick="openEvaluationModal('${v.id}')">Solicitar Evaluación</button>
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

function openAdminPasswordModal() {
  adminPasswordInput.value = '';
  adminPasswordError.style.display = 'none';
  openModal('admin-password-modal');
  adminPasswordInput.focus();
}

function verifyAdminPassword(e) {
  e.preventDefault();
  if (adminPasswordInput.value === ADMIN_PASSWORD) {
    closeModal('admin-password-modal');
    openAdminDashboard();
  } else {
    adminPasswordError.style.display = 'block';
    adminPasswordError.textContent = 'Contraseña incorrecta';
  }
}

function openAdminDashboard() {
  currentEditingId = null;
  resetAdminForm();
  renderAdminTable();
  openModal('admin-modal');
}

function switchAdminTab(tabName) {
  document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  
  document.querySelectorAll('.admin-tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `admin-tab-${tabName}`);
  });
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

      if (supabase) {
        const { error } = await supabase
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

      if (supabase) {
        const { error } = await supabase
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
    if (supabase) {
      try {
        const { error } = await supabase
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
          if (supabase) {
            // Eliminar existentes
            const { error: delError } = await supabase.from('vehicles').delete().neq('id', 'dummy_id_to_clear');
            if (delError) throw delError;
            
            // Insertar nuevos
            const cleanedData = parsed.map(({ id, brand, model, year, mileage, fuel, transmission, price, image, status }) => ({
              id, brand, model, year, mileage, fuel, transmission, price, image, status
            }));
            
            const { error: insError } = await supabase.from('vehicles').insert(cleanedData);
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
      localStorage.setItem('auth_rut', cleanRUT(rutVal));
      checkAuth();
    } else {
      loginRutError.style.display = 'block';
      loginRutError.textContent = 'RUT inválido. Formato correcto: 12.345.678-K';
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
    localStorage.removeItem('auth_rut');
    showScreen('login-screen');
  });
  
  // Filtros de búsqueda
  searchInput.addEventListener('input', renderCatalog);
  filterType.addEventListener('change', renderCatalog);
  filterTransmission.addEventListener('change', renderCatalog);
  filterPrice.addEventListener('change', renderCatalog);
  
  // Disparar modales admin
  adminBtn.addEventListener('click', openAdminPasswordModal);
  adminTriggerFooter.addEventListener('click', openAdminPasswordModal);
  
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
  
  let message = `Hola! Me interesa solicitar la evaluación para la compra de un vehículo:\n\n`;
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
