import requests
import json
import os
import time
from datetime import datetime, timedelta
from difflib import SequenceMatcher

# --- Configurações ---
TOKEN_DADOS = os.environ.get("API_TOKEN") # Football-Data (Logos e Jogos)
TOKEN_ODDS = os.environ.get("ODD_TOKEN")  # The Odds API (Odds Reais)

# Mapeamento de Ligas (ID Football-Data : Key TheOddsAPI)
LIGAS_MAP = {
    "BSA": "soccer_brazil_campeonato",
    "PL": "soccer_epl",
    "PD": "soccer_spain_la_liga",
    "CL": "soccer_uefa_champs_league",
    "SA": "soccer_italy_serie_a",
    "BL1": "soccer_germany_bundesliga",
    "FL1": "soccer_france_ligue_one"
}

# --- Funções Auxiliares ---
def similaridade(a, b):
    """Retorna 0 a 1 indicando o quão parecidos são dois nomes"""
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()

def buscar_jogos_base():
    """Busca a tabela base (com logos) da Football-Data"""
    print("1. Buscando base de jogos e logos...")
    if not TOKEN_DADOS: return []
    
    headers = {"X-Auth-Token": TOKEN_DADOS}
    url = "https://api.football-data.org/v4/matches"
    
    # Busca de ontem até +7 dias
    data_inicio = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
    data_fim = (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d')
    ligas_ids = ",".join(LIGAS_MAP.keys())
    
    params = {
        "competitions": ligas_ids,
        "dateFrom": data_inicio,
        "dateTo": data_fim
    }
    
    res = requests.get(url, headers=headers, params=params)
    if res.status_code == 200:
        return res.json().get('matches', [])
    return []

def buscar_odds_reais():
    """Busca odds da Bet365/Pinnacle"""
    print("2. Buscando odds reais...")
    if not TOKEN_ODDS: return []
    
    todas_odds = []
    for key in LIGAS_MAP.values():
        url = f"https://api.the-odds-api.com/v4/sports/{key}/odds"
        params = {"apiKey": TOKEN_ODDS, "regions": "eu", "markets": "h2h", "oddsFormat": "decimal"}
        try:
            r = requests.get(url, params=params)
            if r.status_code == 200:
                todas_odds.extend(r.json())
        except:
            pass
    return todas_odds

def calcular_odds_simuladas():
    """Fallback: gera odds decentes se a API real falhar"""
    return {"home": 2.10, "draw": 3.20, "away": 3.50} # Genérico

def processar_dados():
    jogos_base = buscar_jogos_base() # Tem ID, Logo, Status
    odds_reais = buscar_odds_reais() # Tem Odds, Nomes (sem logo)
    
    dados_finais = {"resultados": [], "proximos": []}
    
    print(f"Processando {len(jogos_base)} jogos base contra {len(odds_reais)} linhas de odds...")

    for jogo in jogos_base:
        # Estrutura inicial
        item = {
            "id": jogo['id'],
            "data": jogo['utcDate'],
            "status": jogo['status'], # FINISHED, SCHEDULED, IN_PLAY
            "liga": jogo['competition']['name'],
            "liga_code": jogo['competition']['code'], # Usado para filtrar abas
            "time_casa": jogo['homeTeam']['shortName'] or jogo['homeTeam']['name'],
            "time_fora": jogo['awayTeam']['shortName'] or jogo['awayTeam']['name'],
            "brasao_casa": jogo['homeTeam']['crest'],
            "brasao_fora": jogo['awayTeam']['crest'],
            "placar_casa": jogo['score']['fullTime']['home'],
            "placar_fora": jogo['score']['fullTime']['away'],
            # Odds padrão (simuladas) caso não ache a real
            "odds": calcular_odds_simuladas() 
        }

        # Tenta encontrar a Odd Real correspondente (Matchmaking)
        if item['status'] == 'SCHEDULED':
            melhor_match = None
            maior_score = 0
            
            # Data do jogo (apenas dia)
            dia_jogo = item['data'].split('T')[0]

            for odd in odds_reais:
                # 1. Filtro de Data (deve ser o mesmo dia)
                if not odd['commence_time'].startswith(dia_jogo): continue
                
                # 2. Comparar nomes dos times
                score_casa = similaridade(item['time_casa'], odd['home_team'])
                score_fora = similaridade(item['time_fora'], odd['away_team'])
                media = (score_casa + score_fora) / 2
                
                if media > 0.6 and media > maior_score: # 60% de similaridade mínima
                    maior_score = media
                    melhor_match = odd

            # Se achou uma odd real confiável, injeta no item
            if melhor_match:
                try:
                    bookie = melhor_match['bookmakers'][0] # Pega a primeira casa
                    outcomes = bookie['markets'][0]['outcomes']
                    
                    odd_h = next((x['price'] for x in outcomes if x['name'] == melhor_match['home_team']), 0)
                    odd_a = next((x['price'] for x in outcomes if x['name'] == melhor_match['away_team']), 0)
                    odd_d = next((x['price'] for x in outcomes if x['name'] == 'Draw'), 0)
                    
                    if odd_h > 1:
                        item['odds'] = {"home": odd_h, "draw": odd_d, "away": odd_a}
                        item['odds_source'] = "Real (" + bookie['title'] + ")"
                except:
                    pass

            dados_finais["proximos"].append(item)
        
        elif item['status'] in ['FINISHED', 'IN_PLAY', 'PAUSED']:
            dados_finais["resultados"].append(item)

    # Ordenar
    dados_finais["proximos"].sort(key=lambda x: x['data'])
    dados_finais["resultados"].sort(key=lambda x: x['data'], reverse=True) # Mais recentes primeiro

    # Salvar
    with open("dados_futebol.json", "w", encoding="utf-8") as f:
        json.dump(dados_finais, f, indent=4)
    print("Concluído com sucesso.")

if __name__ == "__main__":
    processar_dados()
