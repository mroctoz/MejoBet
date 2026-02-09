import requests
import json
import os
from datetime import datetime, timedelta

# --- Configurações ---
TOKEN_RESULTADOS = os.environ.get("API_TOKEN") # Football-data.org
TOKEN_ODDS = os.environ.get("ODD_TOKEN")       # The Odds API

# --- Ligas mapeadas ---
# Precisamos mapear para saber qual liga estamos processando
LIGAS_ODDS = [
    {"key": "soccer_brazil_campeonato", "nome": "Brasileirão"},
    {"key": "soccer_epl",               "nome": "Premier League"},
    {"key": "soccer_spain_la_liga",     "nome": "La Liga"},
    {"key": "soccer_uefa_champs_league", "nome": "Champions League"},
    {"key": "soccer_italy_serie_a",     "nome": "Serie A"},
    {"key": "soccer_france_ligue_one",   "nome": "Ligue 1"},
    {"key": "soccer_germany_bundesliga", "nome": "Bundesliga"}
]

def buscar_resultados_passados():
    """Busca apenas resultados finais (quem ganhou) para pagar apostas"""
    print("Buscando resultados...")
    if not TOKEN_RESULTADOS: return []
    
    # Busca jogos de ontem (para saber quem ganhou)
    url = "https://api.football-data.org/v4/matches"
    headers = {"X-Auth-Token": TOKEN_RESULTADOS}
    ontem = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
    hoje = datetime.now().strftime('%Y-%m-%d')
    
    try:
        # Pega as principais ligas pelo código da API football-data
        params = {"competitions": "BSA,PL,PD,CL,SA,FL1,BL1", "dateFrom": ontem, "dateTo": hoje, "status": "FINISHED"}
        resp = requests.get(url, headers=headers, params=params)
        
        if resp.status_code == 200:
            matches = resp.json().get('matches', [])
            limpos = []
            for m in matches:
                limpos.append({
                    "id": str(m['id']), # Convertendo pra string pra padronizar
                    "data": m['utcDate'],
                    "status": "FINISHED",
                    "liga": m['competition']['name'],
                    "time_casa": m['homeTeam']['shortName'] or m['homeTeam']['name'],
                    "time_fora": m['awayTeam']['shortName'] or m['awayTeam']['name'],
                    "placar_casa": m['score']['fullTime']['home'],
                    "placar_fora": m['score']['fullTime']['away']
                })
            return limpos
    except Exception as e:
        print(f"Erro resultados: {e}")
        return []
    return []

def buscar_odds_futuras():
    """Busca as odds REAIS da The Odds API"""
    print("Buscando odds...")
    if not TOKEN_ODDS: return []

    jogos_futuros = []

    for liga in LIGAS_ODDS:
        url = f"https://api.the-odds-api.com/v4/sports/{liga['key']}/odds"
        params = {
            "apiKey": TOKEN_ODDS,
            "regions": "eu",
            "markets": "h2h",
            "oddsFormat": "decimal"
        }

        try:
            resp = requests.get(url, params=params)
            dados = resp.json()

            if isinstance(dados, list):
                for jogo in dados:
                    # Tenta pegar odds
                    bookmakers = jogo.get('bookmakers', [])
                    if not bookmakers: continue

                    # Pega a primeira casa de aposta disponível
                    market = bookmakers[0]['markets'][0]
                    outcomes = market['outcomes']

                    # Mapeia as odds com segurança
                    odd_home = next((x['price'] for x in outcomes if x['name'] == jogo['home_team']), 0)
                    odd_away = next((x['price'] for x in outcomes if x['name'] == jogo['away_team']), 0)
                    odd_draw = next((x['price'] for x in outcomes if x['name'] == 'Draw'), 0)

                    jogos_futuros.append({
                        "id": jogo['id'],
                        "data": jogo['commence_time'],
                        "liga": liga['nome'],
                        "time_casa": jogo['home_team'],
                        "time_fora": jogo['away_team'],
                        "odds_casa": odd_home,
                        "odds_empate": odd_draw,
                        "odds_fora": odd_away
                    })
        except Exception as e:
            print(f"Erro na liga {liga['nome']}: {e}")

    return jogos_futuros

# Execução Principal
if __name__ == "__main__":
    dados = {
        "resultados": buscar_resultados_passados(),
        "proximos": buscar_odds_futuras()
    }
    
    # Salva o arquivo JSON final
    with open("dados_futebol.json", "w", encoding="utf-8") as f:
        json.dump(dados, f, indent=4)
    
    print("Dados atualizados com sucesso.")
