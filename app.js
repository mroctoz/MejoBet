// --- Configurações e Estado ---
const API_URL = 'dados_futebol.json'; // O mesmo arquivo gerado pelo Python
let USER_BALANCE = 250.00;
let cart = []; // Aposta atual no boletim
let allMatches = []; // Todos os jogos carregados
let myBets = []; // Histórico de apostas

// --- Inicialização ---
document.addEventListener('DOMContentLoaded', () => {
    carregarUsuario();
    carregarDados();
    setupListeners();
});

function carregarUsuario() {
    // Carregar saldo
    const savedBalance = localStorage.getItem('mejoBet_balance');
    if (savedBalance) USER_BALANCE = parseFloat(savedBalance);
    atualizarDisplaySaldo();

    // Carregar apostas antigas
    const savedBets = localStorage.getItem('mejoBet_history');
    if (savedBets) myBets = JSON.parse(savedBets);
}

// --- Lógica Principal de Dados ---
async function carregarDados() {
    try {
        const response = await fetch(API_URL);
        if(!response.ok) throw new Error("Erro ao ler JSON");
        const data = await response.json();
        
        // Vamos unir proximos e resultados para verificação
        allMatches = [...data.proximos, ...data.resultados];

        // 1. Verificar se alguma aposta aberta foi finalizada
        verificarResultados(data.resultados);

        // 2. Renderizar jogos futuros na tela
        renderizarJogos(data.proximos);

    } catch (error) {
        console.error("Erro:", error);
        document.getElementById('games-container').innerHTML = 
            '<p style="text-align:center; padding:20px;">Erro ao carregar jogos. Verifique se o script Python rodou.</p>';
    }
}

// --- O Gerador de Odds Simuladas ---
// Como a API free não tem odds, criamos odds baseadas em hash do nome
// para que sejam sempre as mesmas para o mesmo jogo.
function gerarOdds(match) {
    // Seed simples baseado no ID do jogo
    const seed = match.id;
    const random = (seed * 9301 + 49297) % 233280;
    const normalized = random / 233280;

    // Simulação: Times variam entre 1.50 e 4.00
    let oddCasa = (1.5 + (normalized * 2.5)).toFixed(2);
    let oddFora = (1.5 + ((1-normalized) * 2.5)).toFixed(2);
    let oddEmpate = (2.8 + (normalized * 0.5)).toFixed(2);

    return { casa: oddCasa, empate: oddEmpate, fora: oddFora };
}

// --- Renderização ---
function renderizarJogos(jogos) {
    const container = document.getElementById('games-container');
    container.innerHTML = '';

    if(jogos.length === 0) {
        container.innerHTML = '<p class="empty-msg">Nenhum jogo disponível para aposta.</p>';
        return;
    }

    // Agrupar por data
    const grupos = {};
    jogos.forEach(j => {
        const data = j.data.split('T')[0];
        if(!grupos[data]) grupos[data] = [];
        grupos[data].push(j);
    });

    for(const [data, lista] of Object.entries(grupos)) {
        // Cabeçalho da data
        const dateHeader = document.createElement('div');
        dateHeader.className = 'game-group-date';
        const d = new Date(data);
        dateHeader.innerText = d.toLocaleDateString('pt-BR', {weekday: 'long', day:'numeric', month:'long'});
        container.appendChild(dateHeader);

        lista.forEach(match => {
            const odds = gerarOdds(match);
            const card = document.createElement('div');
            card.className = 'match-card';
            
            card.innerHTML = `
                <div class="match-meta">
                    <div>${match.liga}</div>
                    <div>${new Date(match.data).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</div>
                </div>
                <div class="teams-info">
                    <div class="team-row">
                        <img src="${match.brasao_casa}" class="team-logo" onerror="this.src='https://via.placeholder.com/20'">
                        <span>${match.time_casa}</span>
                    </div>
                    <div class="team-row">
                        <img src="${match.brasao_fora}" class="team-logo" onerror="this.src='https://via.placeholder.com/20'">
                        <span>${match.time_fora}</span>
                    </div>
                </div>
                <div class="odds-grid">
                    <button class="odd-btn" onclick="selecionarAposta(${match.id}, 'HOME', ${odds.casa}, '${match.time_casa}')">
                        <span class="odd-label">1</span>
                        <span>${odds.casa}</span>
                    </button>
                    <button class="odd-btn" onclick="selecionarAposta(${match.id}, 'DRAW', ${odds.empate}, 'Empate')">
                        <span class="odd-label">X</span>
                        <span>${odds.empate}</span>
                    </button>
                    <button class="odd-btn" onclick="selecionarAposta(${match.id}, 'AWAY', ${odds.fora}, '${match.time_fora}')">
                        <span class="odd-label">2</span>
                        <span>${odds.fora}</span>
                    </button>
                </div>
            `;
            container.appendChild(card);
        });
    }
}

// --- Lógica de Apostas (Carrinho) ---
function selecionarAposta(matchId, pick, odd, nomeSelecao) {
    // Limpa seleções visuais anteriores
    document.querySelectorAll('.odd-btn').forEach(b => b.classList.remove('selected'));
    // (Opcional: Adicionar classe selected ao botão clicado visualmente seria complexo sem ID unico, 
    // mas para simplificar, vamos focar no Bet Slip)

    // Adiciona ao carrinho (Simples: Apenas 1 aposta por vez neste MVP)
    cart = [{
        matchId: matchId,
        pick: pick, // 'HOME', 'DRAW', 'AWAY'
        odd: parseFloat(odd),
        selectionName: nomeSelecao
    }];

    atualizarBoletim();
}

function atualizarBoletim() {
    const container = document.getElementById('bet-slip-items');
    const btn = document.getElementById('place-bet-btn');
    const input = document.getElementById('bet-amount');

    if (cart.length === 0) {
        container.innerHTML = '<p class="empty-msg">Selecione uma cotação.</p>';
        btn.disabled = true;
        document.getElementById('total-odds').innerText = '1.00';
        return;
    }

    const item = cart[0];
    container.innerHTML = `
        <div class="bet-item">
            <div class="bet-item-title">${item.selectionName}</div>
            <div class="bet-item-sel">Vencedor do Encontro @ ${item.odd}</div>
            <i class="fas fa-times remove-bet" onclick="limparCarrinho()"></i>
        </div>
    `;

    document.getElementById('total-odds').innerText = item.odd.toFixed(2);
    btn.disabled = false;
    
    // Atualizar retorno potencial se já tiver valor
    calcularRetorno();
}

function calcularRetorno() {
    const valor = parseFloat(document.getElementById('bet-amount').value);
    if (cart.length > 0 && valor > 0) {
        const retorno = (valor * cart[0].odd).toFixed(2);
        document.getElementById('potential-return').innerText = `R$ ${retorno}`;
    } else {
        document.getElementById('potential-return').innerText = `R$ 0,00`;
    }
}

function limparCarrinho() {
    cart = [];
    atualizarBoletim();
}

function realizarAposta() {
    const valor = parseFloat(document.getElementById('bet-amount').value);
    
    if (isNaN(valor) || valor <= 0) {
        alert("Digite um valor válido.");
        return;
    }
    if (valor > USER_BALANCE) {
        alert("Saldo insuficiente!");
        return;
    }

    // Deduzir saldo
    USER_BALANCE -= valor;
    atualizarDisplaySaldo();

    // Salvar aposta
    const bet = {
        id: Date.now(), // ID único da aposta
        date: new Date().toISOString(),
        matchId: cart[0].matchId,
        pick: cart[0].pick, // HOME, DRAW, AWAY
        selectionName: cart[0].selectionName,
        odd: cart[0].odd,
        stake: valor,
        potentialWin: valor * cart[0].odd,
        status: 'OPEN' // OPEN, WON, LOST
    };

    myBets.unshift(bet); // Adiciona no topo
    salvarDadosLocais();
    
    limparCarrinho();
    document.getElementById('bet-amount').value = '';
    alert("Aposta realizada com sucesso!");
}

// --- Verificação de Resultados (A Mágica) ---
function verificarResultados(jogosFinalizados) {
    let houveMudanca = false;

    myBets.forEach(bet => {
        if (bet.status === 'OPEN') {
            // Procura o jogo correspondente nos resultados
            const jogoReal = jogosFinalizados.find(j => j.id === bet.matchId);

            if (jogoReal) {
                // Determinar quem ganhou no jogo real
                let resultadoReal = 'DRAW';
                if (jogoReal.placar_casa > jogoReal.placar_fora) resultadoReal = 'HOME';
                if (jogoReal.placar_fora > jogoReal.placar_casa) resultadoReal = 'AWAY';

                // Conferir aposta
                if (bet.pick === resultadoReal) {
                    bet.status = 'WON';
                    USER_BALANCE += bet.potentialWin;
                    alert(`Green! Você ganhou R$ ${bet.potentialWin.toFixed(2)} na aposta em ${bet.selectionName}`);
                } else {
                    bet.status = 'LOST';
                }
                houveMudanca = true;
            }
        }
    });

    if (houveMudanca) {
        atualizarDisplaySaldo();
        salvarDadosLocais();
    }
}

// --- Helpers e Persistência ---
function atualizarDisplaySaldo() {
    document.getElementById('user-balance').innerText = `R$ ${USER_BALANCE.toFixed(2)}`;
    localStorage.setItem('mejoBet_balance', USER_BALANCE.toFixed(2));
}

function salvarDadosLocais() {
    localStorage.setItem('mejoBet_history', JSON.stringify(myBets));
}

function mostrarMinhasApostas() {
    document.getElementById('games-container').classList.add('hidden');
    document.getElementById('date-filters').classList.add('hidden');
    document.getElementById('my-bets-view').classList.remove('hidden');
    
    const container = document.getElementById('bets-history-list');
    container.innerHTML = '';

    if (myBets.length === 0) {
        container.innerHTML = '<p>Você ainda não fez nenhuma aposta.</p>';
        return;
    }

    myBets.forEach(bet => {
        let classeStatus = 'bet-open';
        let textoStatus = 'Em Aberto';
        
        if(bet.status === 'WON') { classeStatus = 'bet-won'; textoStatus = 'Ganhou'; }
        if(bet.status === 'LOST') { classeStatus = 'bet-lost'; textoStatus = 'Perdeu'; }

        const div = document.createElement('div');
        div.className = `${classeStatus} text-sm rounded p-3 mb-2`;
        div.innerHTML = `
            <div class="flex justify-between font-bold">
                <span>${bet.selectionName} (${bet.pick})</span>
                <span>R$ ${bet.stake.toFixed(2)}</span>
            </div>
            <div class="flex justify-between text-xs mt-1 text-gray-300">
                <span>Odd: ${bet.odd}</span>
                <span>Retorno: R$ ${bet.potentialWin.toFixed(2)}</span>
            </div>
            <div class="text-right text-xs mt-2 uppercase font-bold">${textoStatus}</div>
        `;
        container.appendChild(div);
    });
}

function setupListeners() {
    document.getElementById('bet-amount').addEventListener('input', calcularRetorno);
    document.getElementById('place-bet-btn').addEventListener('click', realizarAposta);
}

// Filtro simples de navegação (Exemplo)
window.filtrarLiga = function(liga) {
    document.getElementById('games-container').classList.remove('hidden');
    document.getElementById('my-bets-view').classList.add('hidden');
    // Em um app real, filtraria o array allMatches e chamaria renderizarJogos novamente
    // Por enquanto, apenas recarrega a view principal
    location.reload(); 
}
window.mostrarMinhasApostas = mostrarMinhasApostas;
