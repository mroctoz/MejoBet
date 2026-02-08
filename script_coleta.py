import requests
import json
import os
from datetime import datetime, timedelta

# --- Configurações das Chaves ---
TOKEN_RESULTADOS = os.environ.get("API_TOKEN") # Football-data.org
TOKEN_ODDS = os.environ.get("ODD_TOKEN")       # The Odds API

# --- Configurações de Ligas ---
# Mapeamento: Chave da TheOddsAPI : ID da Football-Data
MAPA_LIGAS = [
    {"odds_key": "soccer_brazil_campeonato", "res_id": "BSA", "nome": "Brasileirão"},
    {"odds_key": "soccer_epl",               "res_id": "PL",  "nome": "Premier League"},
    {"odds_key": "soccer_spain_la_liga",     "res_id": "PD",  "nome": "La Liga"},
    {"odds_key": "soccer_uefa_champs_league", "res_id": "CL",  "nome": "Champions League"},
    {"odds_key": "soccer_italy_serie_a",     "res_id": "SA",  "nome": "Serie A"},
]

def buscar_resultados_anteriores():
    """Busca jogos finalizados ontem/hoje para validar apostas"""
    print("Buscando resultados finalizados...")
    resultados = []
    
    if not TOKEN_RESULTADOS:
        print("Aviso: API_TOKEN não encontrado. Resultados não serão atualizados.")
        return []

    headers = {"X-Auth-Token": TOKEN_RESULTADOS}
    ids_ligas = ",".join([l["res_id"] for l in MAPA_LIGAS])
    
    # Busca jogos de ontem e hoje
    hoje = datetime.now().date()
    ontem = hoje - timedelta(days=1)
    
    url = "https://api.football-data.org/v4/matches"
    params = {
        "competitions": ids_ligas,
        "dateFrom": ontem.strftime('%Y-%m-%d'),
        "dateTo": hoje.strftime('%Y-%m-%d'),
        "status": "FINISHED"
    }

    try:
        resp = requests.get(url, headers=headers, params=params)
        if resp.status_code == 200:
            matches = resp.json().get('matches', [])
            for m in matches:
                resultados.append({
                    "id": m['id'], # ID do football-data
                    "data": m['utcDate'],
                    "status": "FINISHED",
                    "liga": m['competition']['name'],
                    "time_casa": m['homeTeam']['shortName'] or m['homeTeam']['name'],
                    "time_fora": m['awayTeam']['shortName'] or m['awayTeam']['name'],
                    "placar_casa": m['score']['fullTime']['home'],
                    "placar_fora": m['score']['fullTime']['away'],
                    "brasao_casa": m['homeTeam']['crest'],
                    "brasao_fora": m['awayTeam']['crest']
                })
    except Exception as e:
        print(f"Erro buscando resultados: {e}")
        
    return resultados

def buscar_odds_futuras():
    """Busca odds reais da Bet365 para os próximos jogos"""
    print("Buscando odds reais...")
    proximos = []
    
    if not TOKEN_ODDS:
        print("Erro: ODD_TOKEN não encontrado!")
        return []

    for liga in MAPA_LIGAS:
        url = f"https://api.the-odds-api.com/v4/sports/{liga['odds_key']}/odds"
        params = {
            "apiKey": TOKEN_ODDS,
            "regions": "eu", # Região (eu=Europa, uk=Reino Unido)
            "markets": "h2h", # Head to head (Vencedor)
            "oddsFormat": "decimal"
        }

        try:
            resp = requests.get(url, params=params)
            if resp.status_code != 200:
                print(f"Erro na liga {liga['nome']}: {resp.status_code}")
                continue

            dados = resp.json()
            
            for jogo in dados:
                # Pega odds da Bet365 ou a primeira que tiver
                bookmakers = jogo.get('bookmakers', [])
                if not bookmakers: continue
                
                # Tenta achar Bet365, senão pega o primeiro
                bookie = next((b for b in bookmakers if b['key'] == 'bet365'), bookmakers[0])
                market = bookie['markets'][0]
                outcomes = market['outcomes']
                
                odd_casa = next((o['price'] for o in outcomes if o['name'] == jogo['home_team']), 1.01)
                odd_fora = next((o['price'] for o in outcomes if o['name'] == jogo['away_team']), 1.01)
                odd_empate = next((o['price'] for o in outcomes if o['name'] == 'Draw'), 1.01)

                proximos.append({
                    "id": jogo['id'], # ID da TheOddsApi (String)
                    "data": jogo['commence_time'],
                    "liga": liga['nome'],
                    "time_casa": jogo['home_team'],
                    "time_fora": jogo['away_team'],
                    # Como essa API não tem logo, mandamos vazio e o front resolve
                    "brasao_casa": "", 
                    "brasao_fora": "",
                    "odds_casa": odd_casa,
                    "odds_empate": odd_empate,
                    "odds_fora": odd_fora,
                    "bookmaker": bookie['title']
                })
                
        except Exception as e:
            print(f"Erro processando liga {liga['nome']}: {e}")

    # Ordenar por data
    proximos.sort(key=lambda x: x['data'])
    return proximos

def main():
    dados_finais = {
        "atualizacao": datetime.now().isoformat(),
        "resultados": buscar_resultados_anteriores(),
        "proximos": buscar_odds_futuras()
    }
    
    # Salvar
    with open("dados_futebol.json", "w", encoding="utf-8") as f:
        json.dump(dados_finais, f, indent=4)
    
    print(f"Concluído! {len(dados_finais['resultados'])} resultados e {len(dados_finais['proximos'])} odds capturadas.")

if __name__ == "__main__":
    main()
