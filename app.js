// --- Estado Global ---
const STATE = {
    balance: 250.00,
    cart: [],
    games: [],
    filter: 'TODOS',
    betsHistory: []
};

const API_URL = 'dados_futebol.json';

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    console.log("Iniciando MejoBet V2..."); // Debug para confirmar que é o novo script
    loadUserData();
    fetchData();
    setupListeners();
});

// --- Busca de Dados ---
async function fetchData() {
    try {
        // Usa timestamp para evitar cache
        const res = await fetch(API_URL + '?t=' + Date.now());
        if (!res.ok) throw new Error("JSON não encontrado.");
        
        const data = await res.json();
        
        // Junta próximos e resultados em uma lista só
        STATE.games = [...(data.proximos || []), ...(data.resultados || [])];
        
        // Verifica se ganhou alguma aposta
        checkBetsResult(data.resultados || []);
        
        renderFeed();
        document.getElementById('last-update').innerText = 'Atualizado: ' + new Date().toLocaleTimeString();

    } catch (e) {
        console.error("Erro fetch:", e);
        const el = document.getElementById('games-feed');
        if(el) el.innerHTML = `<div class="text-center text-red-400 mt-10 border border-red-900 p-4 rounded bg-red-900/10">
            <p>Erro ao carregar dados.</p>
            <small class="text-xs opacity-70">O robô do GitHub ainda não gerou o arquivo JSON ou há um erro de conexão.</small>
        </div>`;
    }
}

// --- Renderização dos Jogos ---
function renderFeed() {
    const container = document.getElementById('games-feed');
    if (!container) return; // Proteção contra erro de null

    container.innerHTML = '';

    // Filtros
    let filtered = STATE.games.filter(g => {
        // Ignora jogos muito velhos (mais de 3 dias atrás)
        const isOld = new Date(g.data) < new Date(Date.now() - 259200000);
        if(isOld) return false;

        if (STATE.filter === 'TODOS') return true;
        // O código da liga pode vir da API ou ser inferido
        const codigoLiga = g.liga_code || inferirCodigoLiga(g.liga);
        return codigoLiga === STATE.filter;
    });

    if (filtered.length === 0) {
        container.innerHTML = `<div class="text-center text-gray-500 py-10">Nenhum jogo encontrado para este filtro.</div>`;
        return;
    }

    // Agrupar por data
    const grouped = {};
    filtered.forEach(g => {
        const dateKey = g.data.split('T')[0];
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push(g);
    });

    // Ordenar datas
    Object.keys(grouped).sort().forEach(date => {
        const dObj = new Date(date + 'T12:00:00');
        const dateStr = dObj.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
        
        // Criação do HTML da Data
        const section = document.createElement('div');
        section.className = 'mb-6';
        section.innerHTML = `<h3 class="text-xs font-bold text-gray-500 uppercase mb-3 border-b border-dark-700 pb-1">${dateStr}</h3>`;
        
        // Lista de jogos daquela data
        const listDiv = document.createElement('div');
        listDiv.className = 'space-y-3';
        
        grouped[date].forEach(game => {
            const isFinished = game.status === 'FINISHED';
            // Garante que odds existam, senão usa padrão
            const odds = game.odds || { home: 1.01, draw: 1.01, away: 1.01 };
            
            // Se odd for inválida (1.01 ou menor), bloqueia aposta
            const oddsInvalidas = odds.home <= 1.01;
            const podeApostar = !isFinished && !oddsInvalidas;

            // Gera cores para fallback de imagem
            const corCasa = stringToColor(game.time_casa);
            const corFora = stringToColor(game.time_fora);

            // HTML do Card
            const card = document.createElement('div');
            card.className = `bg-dark-800 rounded-lg p-3 md:p-4 border border-dark-700 hover:border-dark-600 transition flex flex-col md:flex-row items-center gap-4 relative`;
            
            card.innerHTML = `
                <!-- Info Times -->
                <div class="flex-1 w-full md:w-auto flex items-center justify-between md:justify-start gap-4">
                    <div class="flex flex-col gap-2 w-full">
                        <div class="flex items-center gap-3">
                            ${gerarLogo(game.brasao_casa, game.time_casa, corCasa)}
                            <span class="text-sm font-semibold text-white truncate">${game.time_casa}</span>
                            ${isFinished ? `<span class="ml-auto font-bold text-lg">${game.placar_casa}</span>` : ''}
                        </div>
                        <div class="flex items-center gap-3">
                            ${gerarLogo(game.brasao_fora, game.time_fora, corFora)}
                            <span class="text-sm font-semibold text-white truncate">${game.time_fora}</span>
                            ${isFinished ? `<span class="ml-auto font-bold text-lg">${game.placar_fora}</span>` : ''}
                        </div>
                    </div>
                </div>

                <!-- Botões de Odds -->
                <div class="flex gap-2 w-full md:w-auto mt-2 md:mt-0">
                    ${podeApostar ? `
                        <button onclick="addToSlip('${game.id}', 'HOME', ${odds.home}, '${game.time_casa}')" 
                            class="flex-1 md:w-20 bg-dark-900 rounded p-2 flex flex-col items-center justify-center border border-dark-700 hover:border-brand-500 hover:text-brand-500 transition group">
                            <span class="text-[10px] text-gray-500 group-hover:text-brand-500">1</span>
                            <span class="font-bold text-sm">${odds.home.toFixed(2)}</span>
                        </button>
                        <button onclick="addToSlip('${game.id}', 'DRAW', ${odds.draw}, 'Empate')" 
                            class="flex-1 md:w-20 bg-dark-900 rounded p-2 flex flex-col items-center justify-center border border-dark-700 hover:border-brand-500 hover:text-brand-500 transition group">
                            <span class="text-[10px] text-gray-500 group-hover:text-brand-500">X</span>
                            <span class="font-bold text-sm">${odds.draw.toFixed(2)}</span>
                        </button>
                        <button onclick="addToSlip('${game.id}', 'AWAY', ${odds.away}, '${game.time_fora}')" 
                            class="flex-1 md:w-20 bg-dark-900 rounded p-2 flex flex-col items-center justify-center border border-dark-700 hover:border-brand-500 hover:text-brand-500 transition group">
                            <span class="text-[10px] text-gray-500 group-hover:text-brand-500">2</span>
                            <span class="font-bold text-sm">${odds.away.toFixed(2)}</span>
                        </button>
                    ` : `
                        <div class="flex items-center justify-center w-full md:w-auto px-4 py-2 bg-dark-900 rounded text-xs text-gray-500">
                            ${isFinished ? 'ENCERRADO' : 'SEM ODDS'}
                        </div>
                    `}
                </div>
            `;
            listDiv.appendChild(card);
        });

        section.appendChild(listDiv);
        container.appendChild(section);
    });
}

// --- Funções Auxiliares de Visual ---
function gerarLogo(url, nome, cor) {
    if (url && url.length > 5) {
        return `<img src="${url}" class="w-6 h-6 object-contain" onerror="this.onerror=null;this.parentNode.innerHTML='${gerarPlaceholder(nome, cor)}'">`;
    }
    return gerarPlaceholder(nome, cor);
}

function gerarPlaceholder(nome, cor) {
    return `<div class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm" style="background-color: ${cor}">${nome.substring(0,2).toUpperCase()}</div>`;
}

function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
}

function inferirCodigoLiga(nomeLiga) {
    if(!nomeLiga) return 'OUTROS';
    const n = nomeLiga.toUpperCase();
    if(n.includes('BRASIL') || n.includes('BRAZIL')) return 'BSA';
    if(n.includes('PREMIER')) return 'PL';
    if(n.includes('LIGA') && n.includes('SPAIN')) return 'PD';
    if(n.includes('CHAMPIONS')) return 'CL';
    return 'OUTROS';
}

// --- Carrinho e Apostas ---
function addToSlip(id, pick, odd, name) {
    STATE.cart = [{ id, pick, odd, name }];
    renderSlip();
    openMobileSlip();
}

function renderSlip() {
    const container = document.getElementById('slip-items');
    const btn = document.getElementById('btn-apostar');
    
    if (STATE.cart.length === 0) {
        container.innerHTML = `<div class="text-center text-gray-500 mt-10 text-sm opacity-50"><i class="fas fa-ticket-alt text-4xl mb-3"></i><p>Boletim vazio</p></div>`;
        document.getElementById('total-odds').innerText = '1.00';
        document.getElementById('slip-count').innerText = '0';
        btn.disabled = true;
        return;
    }

    const item = STATE.cart[0];
    container.innerHTML = `
        <div class="bg-dark-700 rounded p-3 relative border-l-4 border-brand-500 shadow-md">
            <button onclick="clearSlip()" class="absolute top-2 right-2 text-gray-400 hover:text-red-500"><i class="fas fa-times"></i></button>
            <div class="text-sm font-bold text-white mb-1 pr-6 truncate">${item.name}</div>
            <div class="text-xs text-gray-400 mb-2">Vencedor do Encontro</div>
            <span class="text-brand-500 font-bold bg-dark-900 px-2 py-1 rounded text-xs">@ ${item.odd.toFixed(2)}</span>
        </div>
    `;

    document.getElementById('total-odds').innerText = item.odd.toFixed(2);
    document.getElementById('slip-count').innerText = '1';
    btn.disabled = false;
    calculateReturn();
}

function calculateReturn() {
    const input = document.getElementById('bet-input');
    const val = parseFloat(input.value);
    const odd = STATE.cart[0] ? STATE.cart[0].odd : 1;
    const pot = (val && val > 0) ? (val * odd).toFixed(2) : '0.00';
    document.getElementById('potential-return').innerText = `R$ ${pot}`;
}

function placeBet() {
    const input = document.getElementById('bet-input');
    const val = parseFloat(input.value);
    
    if (!val || val <= 0) return alert("Valor inválido");
    if (val > STATE.balance) return alert("Saldo insuficiente");

    STATE.balance -= val;
    
    const bet = {
        id: Date.now(),
        matchId: STATE.cart[0].id,
        pick: STATE.cart[0].pick,
        name: STATE.cart[0].name,
        odd: STATE.cart[0].odd,
        stake: val,
        potentialWin: val * STATE.cart[0].odd,
        status: 'OPEN',
        date: new Date().toISOString()
    };

    STATE.betsHistory.unshift(bet);
    saveUserData();
    clearSlip();
    alert("✅ Aposta realizada!");
    updateHeaderBalance();
}

// --- Helpers de Estado ---
function loadUserData() {
    const bal = localStorage.getItem('mejoBet_balance_v2');
    if (bal) STATE.balance = parseFloat(bal);
    const hist = localStorage.getItem('mejoBet_history_v2');
    if (hist) STATE.betsHistory = JSON.parse(hist);
    updateHeaderBalance();
}

function saveUserData() {
    localStorage.setItem('mejoBet_balance_v2', STATE.balance.toFixed(2));
    localStorage.setItem('mejoBet_history_v2', JSON.stringify(STATE.betsHistory));
    updateHeaderBalance();
}

function updateHeaderBalance() {
    const el = document.getElementById('header-balance');
    if(el) el.innerText = `R$ ${STATE.balance.toFixed(2)}`;
}

// --- Verificação de Resultados ---
function checkBetsResult(results) {
    let changed = false;
    STATE.betsHistory.forEach(bet => {
        if (bet.status === 'OPEN') {
            const game = results.find(r => String(r.id) === String(bet.matchId));
            if (game) {
                let result = 'DRAW';
                if (game.placar_casa > game.placar_fora) result = 'HOME';
                if (game.placar_fora > game.placar_casa) result = 'AWAY';

                if (bet.pick === result) {
                    bet.status = 'WON';
                    STATE.balance += bet.potentialWin;
                } else {
                    bet.status = 'LOST';
                }
                changed = true;
            }
        }
    });
    if (changed) {
        saveUserData();
        alert("🔔 Resultados atualizados! Verifique seu histórico.");
    }
}

// --- UI Actions ---
function clearSlip() { STATE.cart = []; renderSlip(); document.getElementById('bet-input').value = ''; }
function toggleMobileSlip() { document.getElementById('betslip-sidebar').classList.toggle('translate-x-full'); }
function openMobileSlip() { document.getElementById('betslip-sidebar').classList.remove('translate-x-full'); }
function alternarHistorico() { 
    document.getElementById('history-view').classList.toggle('hidden'); 
    renderHistory();
}

function renderHistory() {
    const list = document.getElementById('history-list');
    list.innerHTML = '';
    STATE.betsHistory.forEach(bet => {
        let color = bet.status === 'WON' ? 'border-green-500' : (bet.status === 'LOST' ? 'border-red-500' : 'border-gray-500');
        let textStatus = bet.status === 'WON' ? 'GANHOU' : (bet.status === 'LOST' ? 'PERDEU' : 'ABERTO');
        let textClass = bet.status === 'WON' ? 'text-green-400' : (bet.status === 'LOST' ? 'text-red-400' : 'text-gray-400');
        
        list.innerHTML += `
            <div class="bg-dark-800 p-3 rounded border-l-4 ${color} mb-2">
                <div class="flex justify-between font-bold text-white">
                    <span>${bet.name}</span>
                    <span>R$ ${bet.stake.toFixed(2)}</span>
                </div>
                <div class="flex justify-between text-xs text-gray-400 mt-1">
                    <span>Odd: ${bet.odd} (${bet.pick})</span>
                    <span class="${textClass} font-bold">${textStatus}</span>
                </div>
            </div>
        `;
    });
}

function filtrar(code) {
    STATE.filter = code;
    document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.remove('active', 'bg-dark-800', 'text-white');
        b.classList.add('text-gray-400');
        if(b.getAttribute('onclick').includes(code)) {
            b.classList.add('active', 'bg-dark-800', 'text-white');
            b.classList.remove('text-gray-400');
        }
    });
    renderFeed();
}

function setupListeners() {
    document.getElementById('bet-input').addEventListener('input', calculateReturn);
    document.getElementById('btn-apostar').addEventListener('click', placeBet);
}
