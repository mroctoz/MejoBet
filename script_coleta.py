import requests
import json
import os
import random
from datetime import datetime, timedelta
from difflib import SequenceMatcher

# --- Configurações ---
TOKEN_DADOS = os.environ.get("API_TOKEN") # Football-Data.org
TOKEN_ODDS = os.environ.get("ODD_TOKEN")  # The Odds API

# Mapeamento para cruzar as APIs
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

def gerar_odds_backup():
    """Gera odds realistas caso a API de odds falhe ou não ache o jogo"""
    # Favorito aleatório leve
    base = random.uniform(0.3, 0.7)
    odd_home = round(1 / base * 0.9, 2)
    odd_away = round(1 / (1 - base - 0.25) * 0.9, 2)
    odd_draw = round(3.0 + random.uniform(-0.5, 0.5), 2)
    return {"home": odd_home, "draw": odd_draw, "away": odd_away}

def buscar_jogos_completos():
    print("Iniciando coleta híbrida...")
    
    # 1. Buscar Base (Football-Data) - Tem Escudos e Nomes Oficiais
    headers = {"X-Auth-Token": TOKEN_DADOS}
    url_base = "https://api.football-data.org/v4/matches"
    
    data_inicio = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
    data_fim = (datetime.now() + timedelta(days=5)).strftime('%Y-%m-%d')
    ligas_ids = ",".join(LIGAS_MAP.keys())
    
    jogos_estruturados = []
    
    try:
        req = requests.get(url_base, headers=headers, params={"competitions": ligas_ids, "dateFrom": data_inicio, "dateTo": data_fim})
        if req.status_code == 200:
            jogos_estruturados = req.json().get('matches', [])
    except Exception as e:
        print(f"Erro na API Base: {e}")

    # 2. Buscar Odds Reais (The Odds API)
    odds_cache = []
    if TOKEN_ODDS:
        for key in LIGAS_MAP.values():
            try:
                url_odds = f"https://api.the-odds-api.com/v4/sports/{key}/odds"
                r = requests.get(url_odds, params={"apiKey": TOKEN_ODDS, "regions": "eu", "markets": "h2h"})
                if r.status_code == 200:
                    odds_cache.extend(r.json())
            except:
                continue

    # 3. Cruzamento e Montagem Final
    dados_finais = {"resultados": [], "proximos": []}
    
    print(f"Processando {len(jogos_estruturados)} jogos...")

    for jogo in jogos_estruturados:
        # Dados básicos
        item = {
            "id": jogo['id'],
            "data": jogo['utcDate'],
            "status": jogo['status'], # SCHEDULED, FINISHED, IN_PLAY, PAUSED
            "liga": jogo['competition']['name'],
            "liga_code": jogo['competition']['code'],
            "time_casa": jogo['homeTeam']['shortName'] or jogo['homeTeam']['name'],
            "time_fora": jogo['awayTeam']['shortName'] or jogo['awayTeam']['name'],
            "brasao_casa": jogo['homeTeam']['crest'],
            "brasao_fora": jogo['awayTeam']['crest'],
            "placar_casa": jogo['score']['fullTime']['home'],
            "placar_fora": jogo['score']['fullTime']['away'],
            "odds": None
        }

        # Se o jogo não acabou, tenta achar odds
        if item['status'] == 'SCHEDULED' or item['status'] == 'TIMED':
            melhor_match = None
            maior_score = 0
            dia_jogo = item['data'].split('T')[0]

            # Tenta encontrar na lista de odds reais
            for odd_obj in odds_cache:
                # Otimização: Pula se a data não bater
                if not odd_obj['commence_time'].startswith(dia_jogo): continue
                
                s1 = similaridade(item['time_casa'], odd_obj['home_team'])
                s2 = similaridade(item['time_fora'], odd_obj['away_team'])
                media = (s1 + s2) / 2
                
                if media > 0.65 and media > maior_score:
                    maior_score = media
                    melhor_match = odd_obj

            if melhor_match:
                try:
                    # Extrai odd real
                    outcomes = melhor_match['bookmakers'][0]['markets'][0]['outcomes']
                    h = next((x['price'] for x in outcomes if x['name'] == melhor_match['home_team']), 0)
                    a = next((x['price'] for x in outcomes if x['name'] == melhor_match['away_team']), 0)
                    d = next((x['price'] for x in outcomes if x['name'] == 'Draw'), 0)
                    item['odds'] = {"home": h, "draw": d, "away": a}
                except:
                    item['odds'] = gerar_odds_backup() # Falhou ao ler estrutura
            else:
                item['odds'] = gerar_odds_backup() # Não achou match

            dados_finais["proximos"].append(item)
        else:
            # Jogos finalizados ou rolando
            dados_finais["resultados"].append(item)

    # Ordenação
    dados_finais["proximos"].sort(key=lambda x: x['data'])
    dados_finais["resultados"].sort(key=lambda x: x['data'], reverse=True)

    with open("dados_futebol.json", "w", encoding="utf-8") as f:
        json.dump(dados_finais, f, indent=4)
    print("Dados gerados com sucesso.")

if __name__ == "__main__":
    buscar_jogos_completos()
