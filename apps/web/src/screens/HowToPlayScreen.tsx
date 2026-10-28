import { Link } from 'wouter';
import { ScreenHeader } from '../components/ScreenHeader';
import { TileFace } from '../components/TileFace';

const Tile = ({ a, b }: { a: number; b: number }) => (
  <span className="inline-tile">
    <TileFace top={a} bottom={b} width={26} />
  </span>
);

export function HowToPlayScreen() {
  return (
    <main className="screen prose">
      <ScreenHeader title="Como se joga dominó na Praça XV" />

      <section className="card">
        <h2>O dominó da Praça XV</h2>
        <p>
          No Centro de Florianópolis, na sombra da Figueira da Praça XV de Novembro, entre a Catedral e o Palácio Cruz e Sousa, as mesas
          de concreto juntam manezinho de toda a Ilha pra bater dominó em duplas. As regras abaixo são as dessa mesa — as mesmas do
          Dominó Manezinho, online ou no treino contra os bots.
        </p>
      </section>

      <section className="card">
        <h2>A mesa</h2>
        <p>
          São 4 jogadores em <strong>duplas</strong>: teu parceiro senta na tua frente. As 28 pedras são todas distribuídas, 7 pra cada
          um — não tem monte pra comprar.
        </p>
        <p>
          Na primeira mão, sai quem tem a <strong>carroça de sena</strong> <Tile a={6} b={6} />, e sai com ela. Nas outras, começa quem
          bateu a mão anterior, com a pedra que quiser.
        </p>
      </section>

      <section className="card">
        <h2>Jogando</h2>
        <p>
          Na tua vez, encaixa uma pedra numa das duas pontas com o mesmo número. Se a pedra servir nas duas pontas, tu escolhes onde. Não
          tem pedra que sirva? Bate na mesa — <strong>toc-toc</strong> — e passa.
        </p>
        <p>Carroça (pedra com os dois lados iguais) fica atravessada na mesa.</p>
      </section>

      <section className="card">
        <h2>Pontuação</h2>
        <table className="score-table">
          <tbody>
            <tr>
              <td>Batida simples</td>
              <td>bateu com pedra comum</td>
              <td>1 ponto</td>
            </tr>
            <tr>
              <td>Batida de carroça</td>
              <td>
                bateu com carroça <Tile a={4} b={4} />
              </td>
              <td>2 pontos</td>
            </tr>
            <tr>
              <td>Lá-e-ló</td>
              <td>
                a última pedra servia nas duas pontas (ex.: pontas 2 e 5, bateu com <Tile a={2} b={5} />)
              </td>
              <td>3 pontos</td>
            </tr>
            <tr>
              <td>Cruzada</td>
              <td>bateu de carroça com as duas pontas iguais</td>
              <td>4 pontos</td>
            </tr>
          </tbody>
        </table>
        <p>
          <strong>Trancou</strong> (ninguém consegue jogar)? Somam-se os pontinhos de cada dupla: quem tiver menos marca 1 ponto. Empate não
          marca, e sai de novo quem saiu.
        </p>
        <p>
          A partida clássica vai até <strong>6 pontos</strong>. Também dá pra jogar até 10, ou no modo <strong>pontos</strong>: quem bate
          soma os pontinhos que sobraram na mão dos adversários, até 100.
        </p>
        <p>
          <strong>Galo</strong> (opcional): se o adversário logo depois de ti tiver que passar, tua dupla ganha 1 ponto (20 no modo pontos).
        </p>
      </section>

      <section className="card">
        <h2>Dicas da velha guarda</h2>
        <ul>
          <li>Larga as pedras pesadas cedo — se trancar, quem tem menos ponto na mão ganha.</li>
          <li>Repara em quem passou: se passou no 3, não tem 3. Os bots "É um monstro" fazem essa conta.</li>
          <li>Segura a ponta que teu parceiro gosta e fecha a que o adversário precisa.</li>
          <li>Carroça encalhada é carroça perdida: solta enquanto dá.</li>
        </ul>
      </section>

      <section className="card">
        <h2>Dicionário manezinho</h2>
        <dl className="glossary">
          <dt>Ó-lhó-lhó!</dt>
          <dd>Olha só! Serve pra tudo, principalmente pra jogada boa do adversário.</dd>
          <dt>Tás tolo?</dt>
          <dd>Ficou doido? Quando o parceiro joga a pedra errada.</dd>
          <dt>Tanso</dt>
          <dd>Bobo, lerdo. O título mais baixo do ranking.</dd>
          <dt>Mofas com a pomba na balaia</dt>
          <dd>Vais esperar sentado — não vai acontecer.</dd>
          <dt>Dá-lhe!</dt>
          <dd>Vai com tudo!</dd>
        </dl>
      </section>

      <Link href="/treino" className="btn primary block">
        Treinar contra os bots
      </Link>

      <section className="card credits">
        <h2>Créditos</h2>
        <ul>
          <li>
            <strong>Vozes dos personagens:</strong> sintéticas, geradas por inteligência artificial (OpenAI). Não são gravações de pessoas
            reais.
          </li>
          <li>
            <strong>Ilustrações e falas:</strong> Leandro Martins, sob licença CC BY 4.0.
          </li>
          <li>
            <strong>Bonecos 3D e animações:</strong> Quaternius (quaternius.com), domínio público (CC0).
          </li>
          <li>
            <strong>Escudos e nomes do Avaí e do Figueirense:</strong> marcas dos clubes, usados só como homenagem à praça. O jogo não tem
            vínculo com eles.
          </li>
          <li>
            <strong>Código:</strong> aberto, sob licença MIT.
          </li>
        </ul>
      </section>
    </main>
  );
}
