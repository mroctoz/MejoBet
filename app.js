// --- Configurações ---
const API_URL = 'dados_futebol.json';
let USER_BALANCE = 250.00;
let cart = [];
let myBets = [];

// --- Inicialização ---
document.addEventListener('DOMContentLoaded', () => {
    carregarUsuario();
    carregarDados(); // Carrega o JSON
    
    // Listeners de botões
    const btnApostar = document.getElementById('place-bet-btn');
    if(btnApostar) btnApostar.addEventListener('click', realizarAposta);
    
    const inputValor = document.getElementById('bet-amount');
    if(inputValor) inputValor.addEventListener('input', calcularRetorno);
});

// --- Carregar Dados do Usuário ---
function carregarUsuario() {
    const savedBalance = localStorage.getItem('mejoBet_balance');
    if (savedBalance) USER_BALANCE = parseFloat(savedBalance);
    atualizarDisplaySaldo();

    const savedBets = localStorage.getItem('mejoBet_history');
    if (savedBets) myBets = JSON.parse(savedBets);
}

// --- Carregar JSON do Github ---
async function carregarDados() {
    const container = document.getElementById('games-container');
    
    try {
        // Adiciona um timestamp para evitar cache do navegador antigo
        const response = await fetch(API_URL + '?t=' + new Date().getTime());
        
        if(!response.ok) throw new Error("JSON ainda não gerado.");
        
        const data = await response.json();
        
        // Verifica se existem jogos futuros
        if (!data.proximos || data.proximos.length === 0) {
            container.innerHTML = '<p class="text-center p-4">Nenhum jogo com odds disponível no momento.</p>';
            return;
        }

        renderizarJogos(data.proximos);

    } catch (error) {
        console.error("Erro carregando:", error);
        container.innerHTML = `
            <div class="p-4 text-center text-red-400">
                <p>Aguardando atualização das Odds...</p>
                <small>${error.message}</small>
            </div>`;
    }
}

// --- Renderizar na Tela ---
function renderizarJogos(jogos) {
    const container = document.getElementById('games-container');
    container.innerHTML = '';

    // Ordenar por data
    jogos.sort((a, b) => new Date(a.data) - new Date(b.data));

    jogos.forEach(match => {
        // PROTEÇÃO CONTRA NaN: Se a odd não vier, usa 1.00
        const oddCasa = parseFloat(match.odds_casa) || 1.00;
        const oddEmpate = parseFloat(match.odds_empate) || 1.00;
        const oddFora = parseFloat(match.odds_fora) || 1.00;

        // Se as odds forem 0 ou 1, o jogo não tem apostas abertas, então pulamos ou mostramos bloqueado
        if (oddCasa <= 1.01) return; 

        // Gerar cores para os times (já que não temos logos)
        const corCasa = stringToColor(match.time_casa);
        const corFora = stringToColor(match.time_fora);

        // Criar elemento HTML
        const card = document.createElement('div');
        card.className = 'match-card';
        card.innerHTML = `
            <div class="match-meta">
                <div>${match.liga}</div>
                <div>${new Date(match.data).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</div>
            </div>
            
            <div class="teams-info">
                <div class="team-row">
                    <div class="team-logo-placeholder" style="background:${corCasa}">${match.time_casa.charAt(0)}</div>
                    <span>${match.time_casa}</span>
                </div>
                <div class="team-row">
                    <div class="team-logo-placeholder" style="background:${corFora}">${match.time_fora.charAt(0)}</div>
                    <span>${match.time_fora}</span>
                </div>
            </div>

            <div class="odds-grid">
                <button class="odd-btn" onclick="selecionarAposta('${match.id}', 'HOME', ${oddCasa}, '${match.time_casa}')">
                    <span class="odd-label">1</span> <span>${oddCasa.toFixed(2)}</span>
                </button>
                <button class="odd-btn" onclick="selecionarAposta('${match.id}', 'DRAW', ${oddEmpate}, 'Empate')">
                    <span class="odd-label">X</span> <span>${oddEmpate.toFixed(2)}</span>
                </button>
                <button class="odd-btn" onclick="selecionarAposta('${match.id}', 'AWAY', ${oddFora}, '${match.time_fora}')">
                    <span class="odd-label">2</span> <span>${oddFora.toFixed(2)}</span>
                </button>
            </div>
        `;
        container.appendChild(card);
    });
}

// --- Funções Auxiliares de Estilo ---
function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
}

// --- Lógica de Apostas (Carrinho) ---
function selecionarAposta(id, tipo, valorOdd, nome) {
    // Remove seleção visual anterior
    document.querySelectorAll('.odd-btn').forEach(btn => btn.style.border = 'none');
    
    // Atualiza carrinho
    cart = [{ id, tipo, odd: valorOdd, nome }];
    atualizarBoletim();
}

function atualizarBoletim() {
    const slip = document.getElementById('bet-slip-items');
    const totalOdds = document.getElementById('total-odds');
    const btn = document.getElementById('place-bet-btn');

    if (cart.length === 0) {
        slip.innerHTML = '<p class="text-gray-500 text-sm">Selecione uma aposta.</p>';
        btn.disabled = true;
        return;
    }

    const item = cart[0];
    slip.innerHTML = `
        <div class="bg-gray-800 p-3 rounded border border-green-500 relative">
            <div class="font-bold text-sm text-white">${item.nome}</div>
            <div class="text-xs text-green-400">Cotação: ${item.odd.toFixed(2)}</div>
            <button onclick="limparCarrinho()" class="absolute top-1 right-2 text-red-500">x</button>
        </div>
    `;
    totalOdds.innerText = item.odd.toFixed(2);
    btn.disabled = false;
    calcularRetorno();
}

function calcularRetorno() {
    const input = document.getElementById('bet-amount');
    const display = document.getElementById('potential-return');
    if(cart.length > 0 && input.value) {
        const val = parseFloat(input.value);
        display.innerText = 'R$ ' + (val * cart[0].odd).toFixed(2);
    } else {
        display.innerText = 'R$ 0,00';
    }
}

function limparCarrinho() {
    cart = [];
    document.getElementById('bet-amount').value = '';
    atualizarBoletim();
}

function realizarAposta() {
    const val = parseFloat(document.getElementById('bet-amount').value);
    if (!val || val <= 0) return alert("Digite um valor válido");
    if (val > USER_BALANCE) return alert("Saldo insuficiente");

    USER_BALANCE -= val;
    
    // Salva aposta
    const aposta = {
        data: new Date().toISOString(),
        matchId: cart[0].id,
        selection: cart[0].tipo, // HOME, DRAW, AWAY
        odd: cart[0].odd,
        valor: val,
        retorno: val * cart[0].odd,
        status: 'OPEN',
        timeApostado: cart[0].nome
    };
    
    myBets.unshift(aposta);
    atualizarDisplaySaldo();
    salvar();
    limparCarrinho();
    alert("Aposta realizada!");
    mostrarMinhasApostas();
}

// --- Gestão de Dados ---
function atualizarDisplaySaldo() {
    const el = document.getElementById('user-balance');
    if(el) el.innerText = `R$ ${USER_BALANCE.toFixed(2)}`;
}

function salvar() {
    localStorage.setItem('mejoBet_balance', USER_BALANCE.toFixed(2));
    localStorage.setItem('mejoBet_history', JSON.stringify(myBets));
}

// --- Funções de Navegação ---
window.filtrarLiga = function() { location.reload(); }
window.mostrarMinhasApostas = function() {
    const container = document.getElementById('games-container');
    container.innerHTML = '<h3 class="mb-4">Minhas Apostas</h3>';
    
    if(myBets.length === 0) {
        container.innerHTML += '<p>Sem histórico.</p>';
        return;
    }

    myBets.forEach(bet => {
        const div = document.createElement('div');
        div.className = 'bg-gray-800 p-3 mb-2 rounded border-l-4 ' + (bet.status === 'OPEN' ? 'border-gray-500' : (bet.status === 'WON' ? 'border-green-500' : 'border-red-500'));
        div.innerHTML = `
            <div class="flex justify-between">
                <span>${bet.timeApostado}</span>
                <span class="font-bold">R$ ${bet.valor}</span>
            </div>
            <div class="text-xs text-gray-400">Retorno possível: R$ ${bet.retorno.toFixed(2)} (${bet.status})</div>
        `;
        container.appendChild(div);
    });
}
