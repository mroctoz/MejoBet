import requests
import json
import os
from datetime import datetime

# Usamos apenas a API gratuita aqui (Football-Data.org)
API_KEY = os.environ.get("API_TOKEN")

def atualizar_placares():
    print("--- INICIANDO ATUALIZAÇÃO RÁPIDA (LIVE SCORE) ---")
    
    # 1. Carregar o banco de dados atual
    if not os.path.exists("dados_futebol.json"):
        print("Arquivo JSON não existe. Rodando script completo primeiro.")
        return

    with open("dados_futebol.json", "r", encoding="utf-8") as f:
        dados = json.load(f)

    # 2. Buscar jogos AO VIVO ou RECENTES na API Grátis
    # A API gratuita permite muitas requisições, ideal para isso
    headers = {"X-Auth-Token": API_KEY}
    url = "https://api.football-data.org/v4/matches"
    
    # Filtra jogos de hoje para ser rápido
    hoje = datetime.now().strftime('%Y-%m-%d')
    params = {
        "dateFrom": hoje,
        "dateTo": hoje
        # Não filtramos status para pegar FINISHED também
    }

    try:
        resp = requests.get(url, headers=headers, params=params)
        if resp.status_code != 200:
            print(f"Erro API: {resp.status_code}")
            return
            
        matches_api = resp.json().get('matches', [])
        
        # Criar um dicionário para busca rápida: {ID: Jogo}
        # Football-Data ID é inteiro
        mapa_api = {m['id']: m for m in matches_api}
        
        atualizacoes = 0
        
        # 3. Atualizar listas (Ao Vivo e Próximos)
        # Vamos varrer as duas listas do nosso JSON
        listas_para_verificar = [dados.get('ao_vivo', []), dados.get('proximos', [])]
        
        novos_ao_vivo = []
        novos_proximos = []
        
        # Juntar tudo num pool para reclassificar
        pool_jogos = dados.get('ao_vivo', []) + dados.get('proximos', [])
        
        for jogo_local in pool_jogos:
            id_local = jogo_local.get('id')
            
            # Se o jogo existir na API de hoje, atualizamos
            if id_local in mapa_api:
                jogo_real = mapa_api[id_local]
                
                # Atualiza Placar e Status
                status_novo = jogo_real['status'] # IN_PLAY, PAUSED, FINISHED
                placar_casa = jogo_real['score']['fullTime']['home']
                placar_fora = jogo_real['score']['fullTime']['away']
                
                # Se estiver rolando mas o placar for None, é 0x0
                if placar_casa is None: placar_casa = 0
                if placar_fora is None: placar_fora = 0
                
                # Atualiza no objeto local
                jogo_local['status'] = status_novo
                jogo_local['placar_casa'] = placar_casa
                jogo_local['placar_fora'] = placar_fora
                
                # Simula minuto (API free não dá minuto exato, mas dá status)
                if status_novo == 'IN_PLAY':
                    jogo_local['minuto'] = "Ao Vivo"
                elif status_novo == 'PAUSED':
                    jogo_local['minuto'] = "Intervalo"
                elif status_novo == 'FINISHED':
                    jogo_local['minuto'] = "Fim"
                
                atualizacoes += 1
            
            # 4. Reclassificar (Mover de Próximos para Ao Vivo se começou)
            if jogo_local['status'] in ['IN_PLAY', 'PAUSED']:
                novos_ao_vivo.append(jogo_local)
            elif jogo_local['status'] == 'FINISHED':
                # Se acabou, tecnicamente sai do "Próximos", 
                # mas podemos manter no "Ao Vivo" por um tempo ou mover para resultados
                # Para simplificar o visual Bet365, vamos deixar no Ao Vivo como "Encerrado" hoje
                novos_ao_vivo.append(jogo_local)
            else:
                novos_proximos.append(jogo_local)

        # Atualiza o JSON final
        dados['ao_vivo'] = novos_ao_vivo
        dados['proximos'] = novos_proximos
        dados['timestamp'] = datetime.now().isoformat()
        
        with open("dados_futebol.json", "w", encoding="utf-8") as f:
            json.dump(dados, f, indent=4)
            
        print(f"Placares atualizados! {atualizacoes} partidas modificadas.")
        
    except Exception as e:
        print(f"Erro crítico no Live Score: {e}")

if __name__ == "__main__":
    atualizar_placares()
