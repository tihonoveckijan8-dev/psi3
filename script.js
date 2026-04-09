(function(){
  "use strict";

  // ---------- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ----------
  let allResults = [];          // сырые данные из Firestore
  let filteredResults = [];     // после применения фильтров
  let chartInstance = null;

  const contentDiv = document.getElementById('dynamicContent');
  const refreshBtn = document.getElementById('refreshBtn');

  // Доступ к Firebase функциям (установлены в HTML)
  const db = window.firebaseDB;
  const getDocs = window.firebaseGetDocs;
  const collection = window.firebaseCollection;
  const query = window.firebaseQuery;
  const orderBy = window.firebaseOrderBy;

  // ---------- ЗАГРУЗКА ДАННЫХ ----------
  async function loadData() {
    try {
      contentDiv.innerHTML = `
        <div class="glass-card" style="text-align:center; padding:40px;">
          <i class="fas fa-spinner fa-pulse fa-2x"></i>
          <p style="margin-top:16px;">Загрузка результатов тестирования...</p>
        </div>
      `;

      const q = query(collection(db, "quiz_results"), orderBy("timestamp", "desc"));
      const querySnapshot = await getDocs(q);
      
      allResults = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        allResults.push({
          id: doc.id,
          ...data,
          // преобразуем timestamp если нужно
          timestamp: data.timestamp || new Date().toISOString()
        });
      });

      filteredResults = [...allResults];
      renderDashboard();
    } catch (error) {
      console.error("Ошибка загрузки:", error);
      contentDiv.innerHTML = `
        <div class="glass-card" style="text-align:center; padding:40px;">
          <i class="fas fa-exclamation-triangle" style="color: #e74c3c;"></i>
          <p style="margin-top:16px;">Не удалось загрузить данные. Проверьте соединение и права доступа.</p>
          <button class="btn btn-primary" id="retryBtn" style="margin-top:20px;"><i class="fas fa-redo-alt"></i> Повторить</button>
        </div>
      `;
      document.getElementById('retryBtn')?.addEventListener('click', loadData);
    }
  }

  // ---------- ОТРИСОВКА ДАШБОРДА ----------
  function renderDashboard() {
    if (filteredResults.length === 0) {
      contentDiv.innerHTML = `
        <div class="glass-card" style="text-align:center; padding:40px;">
          <i class="fas fa-database"></i>
          <p style="margin-top:16px;">Нет данных для отображения. Попросите учащихся пройти тесты.</p>
        </div>
      `;
      return;
    }

    // Группировка по студентам для статистики
    const studentMap = new Map();
    filteredResults.forEach(r => {
      const key = r.studentName + '|' + (r.studentGroup || '—');
      if (!studentMap.has(key)) {
        studentMap.set(key, {
          name: r.studentName,
          group: r.studentGroup || '—',
          attempts: [],
          avgScore: 0
        });
      }
      studentMap.get(key).attempts.push(r);
    });

    // Вычисляем средний балл для каждого студента
    const studentStats = Array.from(studentMap.values()).map(s => {
      const total = s.attempts.reduce((sum, a) => sum + a.totalScore, 0);
      s.avgScore = total / s.attempts.length;
      return s;
    });

    // Строим HTML
    let html = `
      <div class="glass-card">
        <div class="flex-between" style="margin-bottom: 20px;">
          <h3 style="font-weight: 500;"><i class="fas fa-users"></i> Результаты тестирования (${filteredResults.length} записей)</h3>
          <div class="filter-bar">
            <select id="testFilter" class="filter-select">
              <option value="all">Все тесты</option>
              ${[...new Set(filteredResults.map(r => r.testTitle))].map(t => `<option value="${t}">${t}</option>`).join('')}
            </select>
            <select id="studentFilter" class="filter-select">
              <option value="all">Все учащиеся</option>
              ${[...new Set(filteredResults.map(r => r.studentName))].sort().map(n => `<option value="${n}">${n}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Учащийся</th>
                <th>Группа</th>
                <th>Тест</th>
                <th>Дата</th>
                <th>Результат</th>
                <th>Балл</th>
              </tr>
            </thead>
            <tbody id="tableBody">
              ${generateTableRows(filteredResults)}
            </tbody>
          </table>
        </div>
      </div>

      <div class="glass-card">
        <h3 style="margin-bottom: 20px; font-weight: 500;"><i class="fas fa-chart-bar"></i> Средний балл по учащимся</h3>
        <div class="chart-container">
          <canvas id="studentChart"></canvas>
        </div>
        <p style="margin-top: 16px; opacity: 0.8; font-size: 0.9rem;">
          <i class="fas fa-info-circle"></i> Средний балл по всем пройденным тестам. Чем выше балл, тем лучше эмоциональное состояние.
        </p>
      </div>
    `;

    contentDiv.innerHTML = html;

    // Применяем фильтры
    document.getElementById('testFilter').addEventListener('change', applyFilters);
    document.getElementById('studentFilter').addEventListener('change', applyFilters);

    // Рисуем график
    renderStudentChart(studentStats);
  }

  function generateTableRows(results) {
    if (results.length === 0) {
      return `<tr><td colspan="6" style="text-align:center; padding:30px;">Нет данных</td></tr>`;
    }
    return results.map(r => {
      const date = new Date(r.timestamp).toLocaleString('ru', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      let statusClass = '';
      if (r.resultLevel.toLowerCase().includes('низк')) statusClass = 'status-low';
      else if (r.resultLevel.toLowerCase().includes('средн') || r.resultLevel.toLowerCase().includes('умерен')) statusClass = 'status-medium';
      else statusClass = 'status-high';
      
      return `
        <tr>
          <td><i class="fas fa-user-graduate" style="margin-right:8px; opacity:0.7;"></i>${r.studentName || '—'}</td>
          <td>${r.studentGroup || '—'}</td>
          <td>${r.testTitle || '—'}</td>
          <td>${date}</td>
          <td><span class="status-indicator ${statusClass}"></span>${r.resultLevel || '—'}</td>
          <td><strong>${r.totalScore}</strong></td>
        </tr>
      `;
    }).join('');
  }

  function applyFilters() {
    const testFilter = document.getElementById('testFilter').value;
    const studentFilter = document.getElementById('studentFilter').value;

    filteredResults = allResults.filter(r => {
      if (testFilter !== 'all' && r.testTitle !== testFilter) return false;
      if (studentFilter !== 'all' && r.studentName !== studentFilter) return false;
      return true;
    });

    // Обновляем таблицу без перерисовки всего дашборда
    const tbody = document.getElementById('tableBody');
    if (tbody) {
      tbody.innerHTML = generateTableRows(filteredResults);
    }

    // Пересчитываем статистику для графика
    const studentMap = new Map();
    filteredResults.forEach(r => {
      const key = r.studentName + '|' + (r.studentGroup || '—');
      if (!studentMap.has(key)) {
        studentMap.set(key, {
          name: r.studentName,
          group: r.studentGroup || '—',
          attempts: [],
          avgScore: 0
        });
      }
      studentMap.get(key).attempts.push(r);
    });

    const studentStats = Array.from(studentMap.values()).map(s => {
      const total = s.attempts.reduce((sum, a) => sum + a.totalScore, 0);
      s.avgScore = total / s.attempts.length;
      return s;
    });

    renderStudentChart(studentStats);
  }

  function renderStudentChart(stats) {
    const ctx = document.getElementById('studentChart')?.getContext('2d');
    if (!ctx) return;

    if (chartInstance) {
      chartInstance.destroy();
    }

    // Сортируем по имени
    stats.sort((a,b) => a.name.localeCompare(b.name));

    const labels = stats.map(s => s.name + (s.group ? ` (${s.group})` : ''));
    const scores = stats.map(s => s.avgScore);

    // Цвета в зависимости от уровня
    const backgroundColors = scores.map(score => {
      if (score >= 14) return '#2ecc71';  // высокий
      if (score >= 9) return '#f1c40f';   // средний
      return '#e74c3c';                   // низкий
    });

    chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Средний балл',
          data: scores,
          backgroundColor: backgroundColors,
          borderRadius: 8,
          borderSkipped: false,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => `Средний балл: ${context.raw.toFixed(1)}`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255,255,255,0.2)' },
            title: {
              display: true,
              text: 'Баллы'
            }
          },
          x: {
            grid: { display: false },
            ticks: { maxRotation: 45, minRotation: 45 }
          }
        }
      }
    });
  }

  // ---------- ИНИЦИАЛИЗАЦИЯ ----------
  function init() {
    // Кнопка обновления
    refreshBtn.addEventListener('click', (e) => {
      e.preventDefault();
      loadData();
    });

    // Загружаем данные при старте
    loadData();
  }

  init();
})();