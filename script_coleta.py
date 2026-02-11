import requests
import json
import os
import random
from datetime import datetime, timedelta
from difflib import SequenceMatcher

# --- Configurações ---
TOKEN_DADOS = os.environ.get("API_TOKEN") 
TOKEN_ODDS = os.environ.get("ODD_TOKEN")

LIGAS_MAP = {
    "BSA": "soccer_brazil_campeonato",
    "PL": "soccer_epl",
    "CL": "soccer_uefa_champs_league",
    "PD": "soccer_spain_la_liga",
    "SA": "soccer_italy_serie_a",
}

# --- Funções Auxiliares ---
def gerar_odds_backup():
    base = random.uniform(0.35, 0.65)
    margem = 0.92
    p_home, p_draw = base, 0.25
    p_away = 1.0 - p_home - p_draw
    if p_away < 0.1: p_away = 0.1
    return {
        "home": round((1/p_home) * margem, 2),
        "draw": round((1/p_draw) * margem, 2),
        "away": round((1/p_away) * margem, 2)
    }

def gerar_jogos_ficticios():
    """Gera jogos falsos caso a API esteja vazia (para o site não ficar feio)"""
    print("⚠️ API vazia ou sem jogos futuros. Gerando dados de demonstração...")
    
    agora = datetime.now()
    mocks = [
        {"time_casa": "Flamengo", "time_fora": "Vasco da Gama", "liga": "Brasileirão Série A", "code": "BSA"},
        {"time_casa": "Palmeiras", "time_fora": "Corinthians", "liga": "Brasileirão Série A", "code": "BSA"},
        {"time_casa": "Real Madrid", "time_fora": "Barcelona", "liga": "La Liga", "code": "PD"},
        {"time_casa": "Man City", "time_fora": "Liverpool", "liga": "Premier League", "code": "PL"},
        {"time_casa": "PSG", "time_fora": "Marseille", "liga": "Ligue 1", "code": "FL1"},
        {"time_casa": "Bayern", "time_fora": "Dortmund", "liga": "Bundesliga", "code": "BL1"}
    ]
    
    dados_fake = []
    for i, m in enumerate(mocks):
        # Cria jogos para daqui a 1, 2, 3 horas
        data_jogo = (agora + timedelta(hours=i+1)).strftime("%Y-%m-%dT%H:%M:%SZ")
        
        # O primeiro jogo simula estar AO VIVO
        status = "SCHEDULED"
        placar_casa, placar_fora = 0, 0
        
        if i == 0: 
            status = "IN_PLAY"
            placar_casa = random.randint(0, 2)
            placar_fora = random.randint(0, 2)

        item = {
            "id": 999000 + i,
            "data": data_jogo,
            "status": status,
            "liga": m['liga'],
            "liga_code": m['code'],
            "time_casa": m['time_casa'],
            "time_fora": m['time_fora'],
            "brasao_casa": "", # O front vai gerar o placeholder colorido
            "brasao_fora": "",
            "placar_casa": placar_casa,
            "placar_fora": placar_fora,
            "odds": gerar_odds_backup()
        }
        dados_fake.append(item)
    
    return dados_fake

def buscar_dados():
    print("Iniciando coleta...")
    
    headers = {"X-Auth-Token": TOKEN_DADOS}
    
    # Aumentei o range para 7 dias para tentar achar jogos reais
    hoje = datetime.now().strftime('%Y-%m-%d')
    futuro = (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d')
    
    jogos_brutos = []
    try:
        url = "https://api.football-data.org/v4/matches"
        p = {"competitions": ",".join(LIGAS_MAP.keys()), "dateFrom": hoje, "dateTo": futuro}
        r = requests.get(url, headers=headers, params=p)
        if r.status_code == 200:
            jogos_brutos = r.json().get('matches', [])
    except Exception as e:
        print(f"Erro API: {e}")

    dados_finais = []
    
    # Processa jogos reais
    for jogo in jogos_brutos:
        status = jogo['status']
        if status == 'FINISHED': continue # Ignora encerrados

        odds = gerar_odds_backup() # Usa odds matematicas por padrao (mais rapido)

        item = {
            "id": jogo['id'],
            "data": jogo['utcDate'],
            "status": status,
            "liga": jogo['competition']['name'],
            "liga_code": jogo['competition']['code'],
            "time_casa": jogo['homeTeam']['shortName'] or jogo['homeTeam']['name'],
            "time_fora": jogo['awayTeam']['shortName'] or jogo['awayTeam']['name'],
            "brasao_casa": jogo['homeTeam']['crest'],
            "brasao_fora": jogo['awayTeam']['crest'],
            "placar_casa": jogo['score']['fullTime']['home'] or 0,
            "placar_fora": jogo['score']['fullTime']['away'] or 0,
            "odds": odds
        }
        dados_finais.append(item)

    # SE A LISTA ESTIVER VAZIA (madrugada ou erro da API), GERA FAKE
    if len(dados_finais) == 0:
        dados_finais = gerar_jogos_ficticios()

    # Ordenar: Ao Vivo primeiro
    dados_finais.sort(key=lambda x: (x['status'] != 'IN_PLAY', x['data']))

    container = { "atualizacao": datetime.now().isoformat(), "jogos": dados_finais }

    with open("dados_futebol.json", "w", encoding="utf-8") as f:
        json.dump(container, f, indent=4)
    print(f"Salvo! {len(dados_finais)} jogos disponíveis.")

if __name__ == "__main__":
    buscar_dados()
