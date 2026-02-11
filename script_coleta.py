import requests
import json
import os
import random
from datetime import datetime, timedelta
from difflib import SequenceMatcher

# --- Configurações ---
TOKEN_DADOS = os.environ.get("API_TOKEN") # Football-Data.org
TOKEN_ODDS = os.environ.get("ODD_TOKEN")  # The Odds API

# Ligas suportadas
LIGAS_MAP = {
    "BSA": "soccer_brazil_campeonato",
    "PL": "soccer_epl",
    "PD": "soccer_spain_la_liga",
    "CL": "soccer_uefa_champs_league",
    "SA": "soccer_italy_serie_a",
    "BL1": "soccer_germany_bundesliga",
    "FL1": "soccer_france_ligue_one",
    "PPL": "soccer_portugal_primeira_liga"
}

def similaridade(a, b):
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()

def gerar_odds_backup(is_live=False):
    """Gera odds matemáticas para garantir que o botão de aposta sempre exista"""
    base = random.uniform(0.35, 0.65)
    
    # Margem da casa (vig)
    margem = 0.92
    
    prob_home = base
    prob_draw = 0.25
    prob_away = 1.0 - prob_home - prob_draw
    
    if prob_away < 0.1: prob_away = 0.1
    
    return {
        "home": round((1/prob_home) * margem, 2),
        "draw": round((1/prob_draw) * margem, 2),
        "away": round((1/prob_away) * margem, 2)
    }

def buscar_dados():
    print("Iniciando coleta...")
    
    # 1. Buscar Jogos (Base)
    headers = {"X-Auth-Token": TOKEN_DADOS}
    url_base = "https://api.football-data.org/v4/matches"
    
    # Hoje e Próximos 3 dias
    hoje = datetime.now().strftime('%Y-%m-%d')
    futuro = (datetime.now() + timedelta(days=3)).strftime('%Y-%m-%d')
    
    jogos_brutos = []
    try:
        ligas = ",".join(LIGAS_MAP.keys())
        req = requests.get(url_base, headers=headers, params={"competitions": ligas, "dateFrom": hoje, "dateTo": futuro})
        if req.status_code == 200:
            jogos_brutos = req.json().get('matches', [])
    except Exception as e:
        print(f"Erro ao buscar partidas: {e}")

    # 2. Buscar Odds Reais (Cache)
    odds_cache = []
    if TOKEN_ODDS:
        for key in LIGAS_MAP.values():
            try:
                url = f"https://api.the-odds-api.com/v4/sports/{key}/odds"
                r = requests.get(url, params={"apiKey": TOKEN_ODDS, "regions": "eu", "markets": "h2h"})
                if r.status_code == 200:
                    odds_cache.extend(r.json())
            except: pass

    # 3. Processamento
    dados_finais = []
    
    print(f"Processando {len(jogos_brutos)} partidas...")

    for jogo in jogos_brutos:
        status = jogo['status'] # SCHEDULED, TIMED, IN_PLAY, PAUSED, FINISHED
        
        # FILTRO PRINCIPAL: Ignora jogos encerrados
        if status == 'FINISHED': 
            continue

        # Tenta achar odds reais
        odds = None
        dia_jogo = jogo['utcDate'].split('T')[0]
        time_casa = jogo['homeTeam']['shortName'] or jogo['homeTeam']['name']
        time_fora = jogo['awayTeam']['shortName'] or jogo['awayTeam']['name']

        # Matchmaking de Odds
        melhor_match = None
        maior_score = 0
        for odd_obj in odds_cache:
            if not odd_obj['commence_time'].startswith(dia_jogo): continue
            s = (similaridade(time_casa, odd_obj['home_team']) + similaridade(time_fora, odd_obj['away_team'])) / 2
            if s > 0.65 and s > maior_score:
                maior_score = s
                melhor_match = odd_obj
        
        if melhor_match:
            try:
                outcomes = melhor_match['bookmakers'][0]['markets'][0]['outcomes']
                h = next((x['price'] for x in outcomes if x['name'] == melhor_match['home_team']), 0)
                a = next((x['price'] for x in outcomes if x['name'] == melhor_match['away_team']), 0)
                d = next((x['price'] for x in outcomes if x['name'] == 'Draw'), 0)
                odds = {"home": h, "draw": d, "away": a}
            except: pass
        
        # Se não achou odd real, gera backup (pra não quebrar o site)
        if not odds:
            odds = gerar_odds_backup()

        # Monta objeto final
        item = {
            "id": jogo['id'],
            "data": jogo['utcDate'],
            "status": status, # IN_PLAY = Ao Vivo
            "liga": jogo['competition']['name'],
            "liga_code": jogo['competition']['code'],
            "time_casa": time_casa,
            "time_fora": time_fora,
            "brasao_casa": jogo['homeTeam']['crest'],
            "brasao_fora": jogo['awayTeam']['crest'],
            # Placar só aparece se tiver rolando
            "placar_casa": jogo['score']['fullTime']['home'] if status in ['IN_PLAY', 'PAUSED'] else 0,
            "placar_fora": jogo['score']['fullTime']['away'] if status in ['IN_PLAY', 'PAUSED'] else 0,
            "odds": odds
        }
        dados_finais.append(item)

    # Ordenar: Ao Vivo primeiro, depois data
    dados_finais.sort(key=lambda x: (x['status'] != 'IN_PLAY', x['data']))

    container = {
        "atualizacao": datetime.now().isoformat(),
        "jogos": dados_finais
    }

    with open("dados_futebol.json", "w", encoding="utf-8") as f:
        json.dump(container, f, indent=4)
    print("Dados salvos com sucesso.")

if __name__ == "__main__":
    buscar_dados()
