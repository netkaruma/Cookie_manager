// ============================================
// УНИВЕРСАЛЬНЫЙ МЕНЕДЖЕР КУК
// Работает с любым сайтом
// ============================================

let currentTab = null;
let currentDomain = '';

// Показать статус
function showStatus(message, type = 'info', isHtml = false) {
  const status = document.getElementById('status');
  if (isHtml) {
    status.innerHTML = message;
  } else {
    status.textContent = message;
  }
  status.className = 'status show ' + type;
}

// Получить информацию о текущей вкладке
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;
  
  const url = new URL(tab.url);
  currentDomain = url.hostname;
  
  document.getElementById('siteInfo').innerHTML = `
    🌐 Текущий сайт: <strong>${currentDomain}</strong><br>
    <span class="domain-list">${url.protocol}//${url.hostname}${url.pathname}</span>
  `;
  
  // Показываем количество кук
  const count = await getCookiesCount();
  document.getElementById('siteInfo').innerHTML += `<br>🍪 Найдено кук: <strong>${count}</strong>`;
}

// Получить все куки для текущего домена
async function getCookiesForDomain() {
  const url = new URL(currentTab.url);
  const domain = url.hostname;
  
  let allCookies = [];
  
  // Пробуем получить куки для текущего домена
  try {
    const cookies = await chrome.cookies.getAll({ domain: domain });
    allCookies = allCookies.concat(cookies);
  } catch (e) {}
  
  // Пробуем для .domain (с точкой)
  try {
    const cookies = await chrome.cookies.getAll({ domain: '.' + domain });
    const existingNames = new Set(allCookies.map(c => c.name));
    for (const cookie of cookies) {
      if (!existingNames.has(cookie.name)) {
        allCookies.push(cookie);
      }
    }
  } catch (e) {}
  
  // Пробуем для всех поддоменов (если есть)
  try {
    const parts = domain.split('.');
    for (let i = 1; i < parts.length - 1; i++) {
      const subDomain = parts.slice(i).join('.');
      if (subDomain !== domain && subDomain.length > 0) {
        const cookies = await chrome.cookies.getAll({ domain: subDomain });
        const existingNames = new Set(allCookies.map(c => c.name));
        for (const cookie of cookies) {
          if (!existingNames.has(cookie.name)) {
            allCookies.push(cookie);
          }
        }
      }
    }
  } catch (e) {}
  
  // Удаляем дубликаты по имени + домену
  const unique = new Map();
  for (const cookie of allCookies) {
    const key = cookie.name + '|' + cookie.domain;
    if (!unique.has(key) || cookie.value.length > (unique.get(key)?.value?.length || 0)) {
      unique.set(key, cookie);
    }
  }
  
  return Array.from(unique.values());
}

// Получить количество кук
async function getCookiesCount() {
  const cookies = await getCookiesForDomain();
  return cookies.length;
}

// СОХРАНИТЬ КУКИ В ФАЙЛ
async function saveCookies() {
  try {
    showStatus('⏳ Получение кук...', 'info');
    
    const cookies = await getCookiesForDomain();
    
    if (cookies.length === 0) {
      showStatus('❌ На этом сайте нет кук!', 'error');
      return;
    }
    
    const data = {
      info: {
        site: currentDomain,
        date: new Date().toISOString(),
        count: cookies.length,
        url: currentTab.url
      },
      cookies: cookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || '/',
        secure: c.secure || false,
        httpOnly: c.httpOnly || false,
        sameSite: c.sameSite || 'no_restriction',
        expirationDate: c.expirationDate || null
      }))
    };
    
    const json = JSON.stringify(data, null, 2);
    
    // Скачиваем файл
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cookies_${currentDomain}_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showStatus(`✅ Сохранено ${cookies.length} кук для ${currentDomain}`, 'success');
  } catch (error) {
    showStatus('❌ Ошибка: ' + error.message, 'error');
    console.error(error);
  }
}

// ЗАГРУЗИТЬ КУКИ ИЗ ФАЙЛА
function loadCookiesFromFile() {
  document.getElementById('fileInput').click();
}

// Установить куки из файла
async function importCookies(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    
    if (!data.cookies || !Array.isArray(data.cookies)) {
      showStatus('❌ Неверный формат файла!', 'error');
      return;
    }
    
    const cookies = data.cookies;
    showStatus(`⏳ Установка ${cookies.length} кук...`, 'info');
    
    let success = 0;
    let failed = 0;
    const errors = [];
    
    for (const cookie of cookies) {
      try {
        // Подготавливаем параметры куки
        const details = {
          url: currentTab.url,
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain || currentDomain,
          path: cookie.path || '/',
          secure: cookie.secure || false,
          httpOnly: cookie.httpOnly || false,
          sameSite: cookie.sameSite || 'no_restriction'
        };
        
        // Добавляем expirationDate если есть
        if (cookie.expirationDate) {
          details.expirationDate = cookie.expirationDate;
        } else {
          // Ставим на год вперед
          details.expirationDate = Math.floor(Date.now() / 1000) + 31536000;
        }
        
        await chrome.cookies.set(details);
        success++;
      } catch (e) {
        failed++;
        errors.push(`${cookie.name}: ${e.message}`);
      }
    }
    
    if (failed === 0) {
      showStatus(`✅ Установлено ${success} кук для ${currentDomain}!\n🔄 Обновите страницу (F5)`, 'success');
    } else {
      showStatus(
        `⚠️ Установлено: ${success}, ошибок: ${failed}\n` +
        errors.slice(0, 5).join('\n') +
        (errors.length > 5 ? `\n... и еще ${errors.length - 5} ошибок` : ''),
        'error',
        true
      );
    }
  } catch (error) {
    showStatus('❌ Ошибка при импорте: ' + error.message, 'error');
    console.error(error);
  }
}

// СКОПИРОВАТЬ КУКИ В БУФЕР ОБМЕНА
async function copyCookiesToClipboard() {
  try {
    const cookies = await getCookiesForDomain();
    
    if (cookies.length === 0) {
      showStatus('❌ Нет кук для копирования', 'error');
      return;
    }
    
    // Форматируем как строку "name=value; name2=value2"
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    
    // Копируем через clipboard API
    await navigator.clipboard.writeText(cookieString);
    
    showStatus(`✅ Скопировано ${cookies.length} кук в буфер обмена`, 'success');
  } catch (error) {
    // Fallback если clipboard не работает
    try {
      const cookies = await getCookiesForDomain();
      const text = cookies.map(c => `${c.name}=${c.value}`).join('\n');
      
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      
      showStatus(`✅ Скопировано ${cookies.length} кук (старый способ)`, 'success');
    } catch (e) {
      showStatus('❌ Не удалось скопировать: ' + e.message, 'error');
    }
  }
}

// ОЧИСТИТЬ КУКИ ТЕКУЩЕГО САЙТА
async function clearCookies() {
  if (!confirm(`Очистить все куки для ${currentDomain}?`)) return;
  
  try {
    const cookies = await getCookiesForDomain();
    
    if (cookies.length === 0) {
      showStatus('❌ Нет кук для очистки', 'info');
      return;
    }
    
    let cleared = 0;
    for (const cookie of cookies) {
      try {
        await chrome.cookies.remove({
          url: currentTab.url,
          name: cookie.name
        });
        cleared++;
      } catch (e) {
        console.warn('Не удалось удалить', cookie.name, e);
      }
    }
    
    showStatus(`🗑️ Удалено ${cleared}/${cookies.length} кук`, 'success');
  } catch (error) {
    showStatus('❌ Ошибка: ' + error.message, 'error');
  }
}

// --- ОБРАБОТЧИКИ СОБЫТИЙ ---

document.addEventListener('DOMContentLoaded', getCurrentTab);

document.getElementById('saveBtn').addEventListener('click', saveCookies);
document.getElementById('loadBtn').addEventListener('click', loadCookiesFromFile);
document.getElementById('backupBtn').addEventListener('click', copyCookiesToClipboard);
document.getElementById('clearBtn').addEventListener('click', clearCookies);

document.getElementById('fileInput').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (file) {
    await importCookies(file);
    event.target.value = ''; // Сброс
  }
});

// Обновляем информацию при переключении вкладок
chrome.tabs.onActivated.addListener(() => {
  getCurrentTab();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete' && currentTab && tabId === currentTab.id) {
    getCurrentTab();
  }
});