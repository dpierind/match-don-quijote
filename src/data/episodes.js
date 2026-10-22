/*
 * MATERIAL DE LAS CARTAS — El match con Don Quijote
 *
 * Este archivo contiene un objeto con el mismo formato que un archivo JSON.
 * Se carga como script para que el juego funcione abriendo index.html con doble clic
 * (los navegadores bloquean la lectura de archivos .json sin servidor).
 *
 * La forma más cómoda de editarlo es desde el propio juego: «Material de las cartas».
 * Allí pueden importar y exportar el material en JSON.
 *
 * ESTADO: MATERIAL DE DEMOSTRACIÓN (provisional).
 * 12 episodios reconocibles de la obra. Los capítulos corresponden a la división
 * habitual de la Primera parte (1605, 52 capítulos) y la Segunda parte (1615, 74 capítulos),
 * pero el grupo debe verificarlos con la edición que use como referencia.
 * Las descripciones y respuestas de referencia son paráfrasis propias, no citas textuales.
 *
 * Campos: id, titulo, parte (1 o 2), capitulo, ordenCronologico, descripcion,
 * imagen (ruta, p. ej. "assets/molinos.jpg"; vacía = ilustración provisional),
 * emblema (dibujo provisional: libro, espada, insula, molino, manta, bacia,
 * cadenas, flor, jaula, caballo, luna, vela), preguntas[], respuestasReferencia[]
 * (misma posición que su pregunta), notasArbitro, provisional.
 */
window.MATERIAL_QUIJOTE = {
  "meta": {
    "titulo": "Material de demostración",
    "estado": "demostracion",
    "edicionReferencia": "",
    "nota": "Episodios de ejemplo preparados para probar el juego. No es el material aprobado por el grupo."
  },
  "episodios": [
    {
      "id": "ep-01",
      "titulo": "El hidalgo que se hace caballero andante",
      "parte": 1,
      "capitulo": 1,
      "ordenCronologico": 1,
      "descripcion": "Un hidalgo manchego de unos cincuenta años pasa las noches leyendo libros de caballerías hasta perder el juicio. Decide salir al mundo como caballero andante y busca nombre para su caballo, para sí mismo y para la dama a quien dedicará sus hazañas.",
      "imagen": "",
      "emblema": "libro",
      "preguntas": [
        "¿Por qué los libros de caballerías son el punto de partida de la locura del protagonista? ¿Qué dice esto sobre la relación entre lectura y realidad en la novela?",
        "¿Qué nombres elige para sí mismo, para su caballo y para su dama? ¿Qué revela esa elección?"
      ],
      "respuestasReferencia": [
        "Lee tanto que confunde la ficción caballeresca con el mundo real. La novela parodia esos libros y muestra cómo la lectura moldea la mirada del personaje.",
        "Don Quijote de la Mancha, Rocinante y Dulcinea del Toboso (nombre que da a Aldonza Lorenzo, una labradora). Revela su deseo de transformar lo común en heroico."
      ],
      "notasArbitro": "Aceptar si la respuesta relaciona la lectura con la locura y aporta una idea propia.",
      "provisional": true
    },
    {
      "id": "ep-02",
      "titulo": "Armado caballero en la venta",
      "parte": 1,
      "capitulo": 3,
      "ordenCronologico": 2,
      "descripcion": "Convencido de que una venta es un castillo y su dueño un gran señor, el protagonista le ruega que lo arme caballero. Tras velar las armas en el patio y pelear con unos arrieros, el ventero improvisa una ceremonia burlesca para librarse de él.",
      "imagen": "",
      "emblema": "espada",
      "preguntas": [
        "¿Por qué el ventero acepta seguirle el juego al protagonista? ¿Qué efecto cómico produce la ceremonia?"
      ],
      "respuestasReferencia": [
        "Quiere deshacerse pronto de él después de los altercados con los arrieros. La ceremonia, en la que finge leer de un libro de cuentas, parodia los ritos de la caballería."
      ],
      "notasArbitro": "",
      "provisional": true
    },
    {
      "id": "ep-03",
      "titulo": "Sancho se convierte en escudero",
      "parte": 1,
      "capitulo": 7,
      "ordenCronologico": 3,
      "descripcion": "El caballero convence a un labrador vecino, pobre y de buena fe, para que lo acompañe como escudero. Le promete que algún día lo hará gobernador de una ínsula. Ambos salen de noche sin despedirse de sus familias.",
      "imagen": "",
      "emblema": "insula",
      "preguntas": [
        "¿Qué motiva a Sancho a acompañar a don Quijote? ¿En qué se diferencia su manera de ver el mundo de la de su amo?"
      ],
      "respuestasReferencia": [
        "La promesa de gobernar una ínsula y el interés material. Sancho es práctico y realista frente al idealismo de don Quijote."
      ],
      "notasArbitro": "",
      "provisional": true
    },
    {
      "id": "ep-04",
      "titulo": "Los molinos de viento",
      "parte": 1,
      "capitulo": 8,
      "ordenCronologico": 4,
      "descripcion": "En el campo aparecen treinta o cuarenta molinos. El caballero los toma por gigantes y, pese a las advertencias de su escudero, los embiste con la lanza. Un aspa lo derriba junto a su caballo, y él culpa de lo ocurrido a un encantador.",
      "imagen": "",
      "emblema": "molino",
      "preguntas": [
        "¿Cómo explica don Quijote su derrota? ¿Por qué esa explicación le permite conservar su visión del mundo?",
        "¿Por qué crees que este episodio se ha convertido en un símbolo de toda la obra?"
      ],
      "respuestasReferencia": [
        "Culpa al sabio Frestón, que habría convertido a los gigantes en molinos para quitarle la gloria. Los encantadores le permiten no aceptar la realidad.",
        ""
      ],
      "notasArbitro": "La segunda pregunta no tiene respuesta de referencia a propósito: sirve para probar el aviso al árbitro.",
      "provisional": true
    },
    {
      "id": "ep-05",
      "titulo": "El manteo de Sancho",
      "parte": 1,
      "capitulo": 17,
      "ordenCronologico": 5,
      "descripcion": "El caballero se marcha de una venta sin pagar, alegando que los caballeros andantes nunca pagan hospedaje. Su escudero no logra escapar: unos huéspedes lo lanzan por los aires sobre una manta mientras su amo lo observa desde fuera sin poder ayudarlo.",
      "imagen": "",
      "emblema": "manta",
      "preguntas": [
        "¿Qué consecuencias tiene para Sancho la visión caballeresca de su amo? ¿Cómo explica don Quijote que no pudo socorrerlo?"
      ],
      "respuestasReferencia": [
        "Sancho paga el precio de la fantasía de su amo. Don Quijote lo atribuye a un encantamiento y dice que no pudo saltar la tapia para ayudarlo."
      ],
      "notasArbitro": "",
      "provisional": true
    },
    {
      "id": "ep-06",
      "titulo": "El yelmo de Mambrino",
      "parte": 1,
      "capitulo": 21,
      "ordenCronologico": 6,
      "descripcion": "Bajo la lluvia se acerca un barbero que protege su sombrero con una bacía de latón reluciente. El caballero cree ver a un guerrero con un yelmo de oro, lo ataca y se queda con la bacía, convencido de que es un yelmo legendario.",
      "imagen": "",
      "emblema": "bacia",
      "preguntas": [
        "¿Qué muestra la diferencia entre «yelmo» y «bacía» sobre la forma en que cada personaje interpreta la realidad?"
      ],
      "respuestasReferencia": [
        "Lo que Sancho ve como una bacía de barbero, don Quijote lo ve como el yelmo de Mambrino. Más adelante Sancho propone la palabra «baciyelmo» como solución intermedia."
      ],
      "notasArbitro": "",
      "provisional": true
    },
    {
      "id": "ep-07",
      "titulo": "La liberación de los galeotes",
      "parte": 1,
      "capitulo": 22,
      "ordenCronologico": 7,
      "descripcion": "El caballero encuentra a un grupo de presos encadenados que son llevados a remar en las galeras del rey. Tras escuchar sus historias, decide liberarlos por la fuerza. Los liberados, en lugar de agradecérselo, terminan apedreándolo.",
      "imagen": "",
      "emblema": "cadenas",
      "preguntas": [
        "¿Por qué la buena intención de don Quijote termina mal? ¿Qué reflexión sobre la justicia plantea el episodio?"
      ],
      "respuestasReferencia": [
        "Aplica un ideal de libertad sin considerar la culpa de los presos ni la ley. Cuando les pide que se presenten ante Dulcinea, Ginés de Pasamonte y los demás lo apedrean."
      ],
      "notasArbitro": "",
      "provisional": true
    },
    {
      "id": "ep-08",
      "titulo": "Dulcinea encantada",
      "parte": 2,
      "capitulo": 10,
      "ordenCronologico": 8,
      "descripcion": "Enviado a buscar a la dama de su señor en El Toboso, el escudero no sabe dónde encontrarla. Al ver a tres labradoras montadas en burros, inventa que una de ellas es la dama. El caballero solo ve a una campesina tosca y concluye que está encantada.",
      "imagen": "",
      "emblema": "flor",
      "preguntas": [
        "¿Cómo cambia la relación entre Sancho y don Quijote en este episodio?"
      ],
      "respuestasReferencia": [
        "Sancho, que antes representaba el realismo, ahora manipula la fantasía de su amo usando la misma lógica de los encantamientos."
      ],
      "notasArbitro": "",
      "provisional": true
    },
    {
      "id": "ep-09",
      "titulo": "La aventura de los leones",
      "parte": 2,
      "capitulo": 17,
      "ordenCronologico": 9,
      "descripcion": "Un carro transporta dos leones enjaulados como regalo para el rey. El caballero obliga al leonero a abrir la jaula para enfrentarse a uno de ellos. La fiera se despereza, lo mira y vuelve a echarse. Desde entonces el protagonista adopta un nuevo sobrenombre.",
      "imagen": "",
      "emblema": "jaula",
      "preguntas": [
        "¿Es valentía o temeridad lo que muestra don Quijote? Argumenta a partir del episodio.",
        "¿Qué nuevo sobrenombre adopta y qué nombre deja atrás?"
      ],
      "respuestasReferencia": [
        "Puede leerse como temeridad cómica o como valor auténtico; el león no ataca. Don Diego de Miranda, el Caballero del Verde Gabán, presencia la escena.",
        "Pasa a llamarse Caballero de los Leones en lugar de Caballero de la Triste Figura."
      ],
      "notasArbitro": "En la primera pregunta valoren la argumentación más que la postura elegida.",
      "provisional": true
    },
    {
      "id": "ep-10",
      "titulo": "El vuelo en Clavileño",
      "parte": 2,
      "capitulo": 41,
      "ordenCronologico": 10,
      "descripcion": "En el palacio de unos duques, el caballero y su escudero montan con los ojos vendados un caballo de madera que, según les dicen, vuela por los aires. Los criados simulan el viaje con fuelles y fuego, y todo termina con un estallido de cohetes.",
      "imagen": "",
      "emblema": "caballo",
      "preguntas": [
        "¿Qué papel cumplen los duques en la Segunda parte y qué opinas de sus burlas?"
      ],
      "respuestasReferencia": [
        "Han leído la Primera parte y preparan engaños para divertirse a costa de los protagonistas. Sus burlas invitan a preguntarse quién actúa con más locura o crueldad."
      ],
      "notasArbitro": "",
      "provisional": true
    },
    {
      "id": "ep-11",
      "titulo": "La derrota ante el Caballero de la Blanca Luna",
      "parte": 2,
      "capitulo": 64,
      "ordenCronologico": 11,
      "descripcion": "En la playa de Barcelona, un caballero desconocido desafía al protagonista y lo vence. Como condición, le exige volver a su aldea y no tomar las armas durante un año. Más tarde se descubre quién se escondía bajo esa armadura.",
      "imagen": "",
      "emblema": "luna",
      "preguntas": [
        "¿Quién es el Caballero de la Blanca Luna y por qué usa las reglas de la caballería para vencer a don Quijote?"
      ],
      "respuestasReferencia": [
        "Es el bachiller Sansón Carrasco. Quiere que don Quijote vuelva a casa y recupere la cordura, y usa las reglas caballerescas porque sabe que él las respetará."
      ],
      "notasArbitro": "",
      "provisional": true
    },
    {
      "id": "ep-12",
      "titulo": "La muerte de Alonso Quijano",
      "parte": 2,
      "capitulo": 74,
      "ordenCronologico": 12,
      "descripcion": "De vuelta en su aldea, el hidalgo enferma. Tras un largo sueño recupera el juicio, reniega de los libros de caballerías, hace testamento y muere rodeado de los suyos.",
      "imagen": "",
      "emblema": "vela",
      "preguntas": [
        "¿Qué significa que el personaje vuelva a llamarse Alonso Quijano antes de morir?"
      ],
      "respuestasReferencia": [
        "Marca el abandono de la identidad caballeresca. Puede leerse como lucidez final o como pérdida del ideal; Sancho incluso le propone salir de nuevo, esta vez como pastores."
      ],
      "notasArbitro": "",
      "provisional": true
    }
  ]
};
