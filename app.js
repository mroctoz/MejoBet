// --- Estado Global ---
const STATE = {
    balance: 250.00,
    cart: [],
    games: [],
    filter: 'TODOS',
    bets: []
};

const API = 'dados_futebol.json';

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    // Atualiza a cada 60s
    setInterval(fetchGames, 60000);
});

function loadData() {
    const bal = localStorage.getItem('mb_balance');
    if(bal) STATE.balance = parseFloat(bal);
    
    const hist = localStorage.getItem('mb_history');
    if(hist) STATE.bets = JSON.parse(hist);

    updateUI();
    fetchGames();
}

async function fetchGames() {
    try {
        const res = await fetch(API + '?t=' + Date.now());
        if(!res.ok) throw new Error("Erro na API");
        
        const data = await res.json();
        STATE.games = [...(data.proximos || []), ...(data.resultados || [])];
        
        checkResults(data.resultados || []);
        render();
        document.getElementById('loading-indicator').style.display = 'none';
    } catch (e) {
        console.error(e);
    }
}

// --- Renderização ---
function render() {
    const feed = document.getElementById('games-feed');
    feed.innerHTML = '';

    // Filtros de tempo e liga
    const filtered = STATE.games.filter(g => {
        // Remove jogos com mais de 24h passadas
        if (new Date(g.data) < new Date(Date.now() - 86400000)) return false;
        
        if (STATE.filter === 'TODOS') return true;
        
        // Match seguro do código da liga
        const code = g.liga_code || inferLeague(g.liga);
        return code === STATE.filter;
    });

    if(filtered.length === 0) {
        feed.innerHTML = '<div class="text-center text-gray-500 py-10">Nenhum jogo encontrado.</div>';
        return;
    }

    // Agrupar por data
    const groups = {};
    filtered.forEach(g => {
        const d = g.data.split('T')[0];
        if(!groups[d]) groups[d] = [];
        groups[d].push(g);
    });

    Object.keys(groups).sort().forEach(date => {
        const dateObj = new Date(date + 'T12:00:00');
        const dateStr = dateObj.toLocaleDateString('pt-BR', {weekday: 'long', day:'numeric', month:'long'});
        
        // Cabeçalho da Data
        const section = document.createElement('div');
        section.innerHTML = `
            <div class="flex items-center gap-2 mb-3 mt-6">
                <div class="h-px bg-dark-700 flex-1"></div>
                <span class="text-xs font-bold text-gray-500 uppercase tracking-wider">${dateStr}</span>
                <div class="h-px bg-dark-700 flex-1"></div>
            </div>`;
        
        const list = document.createElement('div');
        list.className = 'space-y-3';

        groups[date].forEach(game => {
            const gameTime = new Date(game.data);
            const now = new Date();
            const hasStarted = now >= gameTime;
            const isFinished = game.status === 'FINISHED';
            
            // Odds fallback seguro
            const odds = game.odds || { home: 1.01, draw: 1.01, away: 1.01 };
            const canBet = !hasStarted && !isFinished && odds.home > 1.01;

            // Cores
            const cHome = stringToColor(game.time_casa);
            const cAway = stringToColor(game.time_fora);

            // Tratamento de nomes para evitar aspas quebrando HTML
            const nameHome = escapeHtml(game.time_casa);
            const nameAway = escapeHtml(game.time_fora);

            const card = document.createElement('div');
            card.className = 'bg-dark-800 rounded-lg p-4 border border-dark-700 hover:border-dark-600 transition shadow-sm';
            
            // Layout Grid: [Liga/Status] [Times] [Botões]
            // Badge Status
            let statusHTML = `<span class="text-xs font-mono text-gray-400 flex items-center gap-1"><i class="far fa-clock"></i> ${gameTime.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</span>`;
            
            if (isFinished) {
                statusHTML = `<span class="text-[10px] font-bold text-gray-400 bg-dark-900 px-2 py-0.5 rounded border border-dark-700">FIM: ${game.placar_casa}-${game.placar_fora}</span>`;
            } else if (hasStarted) {
                statusHTML = `<span class="text-[10px] font-bold text-red-500 animate-pulse">AO VIVO</span>`;
            }

            // --- HTML DO CARD ---
            // Usamos grid-cols-3 para alinhar perfeitamente Home - VS - Away
            card.innerHTML = `
                <div class="flex justify-between items-center mb-4 border-b border-dark-700 pb-2">
                    <span class="text-[10px] font-bold text-brand-600 uppercase tracking-wider">${game.liga_code || 'INT'}</span>
                    ${statusHTML}
                </div>

                <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mb-4">
                    <!-- Home -->
                    <div class="flex items-center gap-3 overflow-hidden">
                        ${renderImg(game.brasao_casa, nameHome, cHome)}
                        <span class="text-sm font-semibold text-white truncate">${nameHome}</span>
                    </div>

                    <!-- VS -->
                    <div class="text-[10px] text-dark-600 font-bold px-2">VS</div>

                    <!-- Away -->
                    <div class="flex items-center gap-3 overflow-hidden justify-end">
                        <span class="text-sm font-semibold text-white truncate text-right">${nameAway}</span>
                        ${renderImg(game.brasao_fora, nameAway, cAway)}
                    </div>
                </div>

                <!-- Botões -->
                <div class="grid grid-cols-3 gap-2">
                    ${renderBtn(game.id, 'HOME', odds.home, nameHome, canBet, '1')}
                    ${renderBtn(game.id, 'DRAW', odds.draw, 'Empate', canBet, 'X')}
                    ${renderBtn(game.id, 'AWAY', odds.away, nameAway, canBet, '2')}
                </div>
            `;
            list.appendChild(card);
        });

        section.appendChild(list);
        feed.appendChild(section);
    });
}

// --- Helpers de HTML Seguro ---
function escapeHtml(text) {
    if (!text) return text;
    return text.replace(/["']/g, ""); // Remove aspas para não quebrar atributos
}

function renderImg(url, name, color) {
    // Atenção: Aqui chamamos a função global imgError definida no HTML
    // Usamos aspas simples nos atributos para evitar conflito
    if (url && url.length > 5) {
        return `<img src="${url}" class="team-logo" onerror="imgError(this, '${name}', '${color}')" alt="${name}">`;
    }
    return `<div class="avatar-fallback" style="background:${color}">${name.substring(0,2).toUpperCase()}</div>`;
}

function renderBtn(id, pick, odd, name, enabled, label) {
    if (!enabled) {
        return `
            <div class="bg-dark-900 rounded py-2 flex flex-col items-center justify-center border border-dark-700 opacity-50 cursor-not-allowed">
                <span class="text-[10px] text-gray-500">${label}</span>
                <span class="text-gray-600 font-bold text-xs">--</span>
            </div>`;
    }
    return `
        <button onclick="addBet('${id}', '${pick}', ${odd}, '${name}')" 
            class="bg-dark-700 hover:bg-dark-600 hover:border-brand-500 border border-transparent rounded py-2 flex flex-col items-center justify-center transition group">
            <span class="text-[10px] text-gray-500 group-hover:text-brand-500 transition-colors">${label}</span>
            <span class="text-brand-500 font-bold text-sm group-hover:text-white transition-colors">${odd.toFixed(2)}</span>
        </button>`;
}

function inferLeague(name) {
    if(!name) return 'INT';
    const n = name.toUpperCase();
    if(n.includes('BRASIL')) return 'BSA';
    if(n.includes('PREMIER')) return 'PL';
    if(n.includes('CHAMPIONS')) return 'CL';
    return 'INT';
}

function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
}

// --- Lógica de Apostas ---
function addBet(id, pick, odd, name) {
    STATE.cart = [{id, pick, odd, name}];
    updateSlip();
    // No mobile, abre o painel
    document.getElementById('betslip-panel').classList.remove('translate-y-full');
}

function updateSlip() {
    const container = document.getElementById('slip-items');
    const btn = document.getElementById('btn-place-bet');
    
    if (STATE.cart.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-gray-600 opacity-50">
                <i class="fas fa-ticket-alt text-4xl mb-2"></i>
                <p class="text-xs">Selecione uma cotação</p>
            </div>`;
        btn.disabled = true;
        document.getElementById('slip-total-odds').innerText = '1.00';
        document.getElementById('slip-badge').innerText = '0';
        return;
    }

    const item = STATE.cart[0];
    container.innerHTML = `
        <div class="bg-dark-700 p-3 rounded border-l-2 border-brand-500 relative animate-fade-in-up">
            <div class="flex justify-between items-start mb-1">
                <span class="text-xs text-brand-500 font-bold uppercase">Vencedor</span>
                <button onclick="clearSlip()" class="text-dark-600 hover:text-red-500"><i class="fas fa-times"></i></button>
            </div>
            <div class="font-bold text-white text-sm mb-2">${item.name}</div>
            <div class="flex justify-between items-center bg-dark-900 p-2 rounded">
                <span class="text-xs text-gray-400">Odd</span>
                <span class="text-brand-500 font-bold">${item.odd.toFixed(2)}</span>
            </div>
        </div>
    `;

    document.getElementById('slip-total-odds').innerText = item.odd.toFixed(2);
    document.getElementById('slip-badge').innerText = '1';
    btn.disabled = false;
    calcReturn();
}

function calcReturn() {
    const input = document.getElementById('bet-amount');
    const val = parseFloat(input.value);
    const odd = STATE.cart[0] ? STATE.cart[0].odd : 1.00;
    
    const pot = (val && val > 0) ? (val * odd).toFixed(2) : '0.00';
    document.getElementById('slip-return').innerText = `R$ ${pot}`;
}

function placeBet() {
    const input = document.getElementById('bet-amount');
    const val = parseFloat(input.value);
    
    if (!val || val <= 0) return alert("Digite um valor válido");
    if (val > STATE.balance) return alert("Saldo insuficiente");

    STATE.balance -= val;
    
    const bet = {
        ...STATE.cart[0],
        stake: val,
        potential: val * STATE.cart[0].odd,
        status: 'OPEN',
        date: new Date().toISOString()
    };

    STATE.bets.unshift(bet);
    saveData();
    clearSlip();
    alert("Aposta realizada com sucesso!");
    toggleMobileSlip();
}

// --- Utils de UI ---
function clearSlip() { STATE.cart = []; updateSlip(); document.getElementById('bet-amount').value = ''; }
function toggleMobileSlip() { document.getElementById('betslip-panel').classList.toggle('translate-y-full'); }
function toggleHistory() { 
    const el = document.getElementById('history-modal');
    el.classList.toggle('hidden');
    if(!el.classList.contains('hidden')) renderHistory();
}
function filtrar(code) { 
    STATE.filter = code; 
    render();
    document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.remove('active', 'bg-dark-700', 'text-white');
        b.classList.add('text-gray-400');
        if(b.getAttribute('onclick').includes(code)) {
            b.classList.add('active', 'bg-dark-700', 'text-white');
            b.classList.remove('text-gray-400');
        }
    });
}
function saveData() {
    localStorage.setItem('mb_balance', STATE.balance.toFixed(2));
    localStorage.setItem('mb_history', JSON.stringify(STATE.bets));
    updateUI();
}
function updateUI() {
    document.getElementById('header-balance').innerText = `R$ ${STATE.balance.toFixed(2)}`;
}

function checkResults(results) {
    let changed = false;
    STATE.bets.forEach(bet => {
        if(bet.status === 'OPEN') {
            const game = results.find(r => String(r.id) === String(bet.id));
            if(game) {
                let res = 'DRAW';
                if(game.placar_casa > game.placar_fora) res = 'HOME';
                if(game.placar_fora > game.placar_casa) res = 'AWAY';

                if(bet.pick === res) {
                    bet.status = 'WON';
                    STATE.balance += bet.potential;
                } else {
                    bet.status = 'LOST';
                }
                changed = true;
            }
        }
    });
    if(changed) { saveData(); alert("Suas apostas foram atualizadas!"); }
}

function renderHistory() {
    const list = document.getElementById('history-list');
    list.innerHTML = '';
    
    if(STATE.bets.length === 0) {
        list.innerHTML = '<p class="text-center text-gray-500 text-sm">Sem histórico.</p>';
        return;
    }

    STATE.bets.forEach(b => {
        let color = b.status === 'WON' ? 'text-brand-500' : (b.status === 'LOST' ? 'text-red-500' : 'text-gray-400');
        let border = b.status === 'WON' ? 'border-brand-500' : (b.status === 'LOST' ? 'border-red-500' : 'border-dark-600');
        let label = b.status === 'WON' ? 'GANHOU' : (b.status === 'LOST' ? 'PERDEU' : 'ABERTO');

        list.innerHTML += `
            <div class="bg-dark-900 p-3 rounded border-l-2 ${border}">
                <div class="flex justify-between items-center mb-2">
                    <span class="text-white font-bold text-sm truncate pr-2">${b.name}</span>
                    <span class="text-xs font-mono text-gray-400">${new Date(b.date).toLocaleDateString('pt-BR')}</span>
                </div>
                <div class="flex justify-between items-end">
                    <div class="flex flex-col text-xs text-gray-400">
                        <span>Aposta: R$ ${b.stake}</span>
                        <span>Odd: ${b.odd} (${b.pick})</span>
                    </div>
                    <span class="text-xs font-bold ${color}">${label}</span>
                </div>
            </div>
        `;
    });
}

// Listeners de Input
document.getElementById('bet-amount').addEventListener('input', calcReturn);
