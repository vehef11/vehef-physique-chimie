/* Verrou de progression.
 *
 * ATTENTION — ce n'est PAS une sécurité réelle. GitHub Pages ne sert que des
 * fichiers statiques : il n'y a aucun serveur pour vérifier un mot de passe.
 * Un élève déterminé peut lire le code source ou taper directement l'adresse
 * d'une animation. Ce verrou sert uniquement à éviter qu'on ouvre par curiosité
 * un chapitre pas encore traité en classe.
 *
 * Pour changer un mot de passe : ouvrir assets/motdepasse.html, taper le
 * nouveau mot de passe, puis recopier le code obtenu dans l'attribut
 * data-gate-hash de la page concernée.
 */
(function () {
  var body = document.body;
  var hash = body.getAttribute('data-gate-hash');
  if (!hash) return;

  var key = 'vdv-gate-' + (body.getAttribute('data-gate-id') || 'default');
  var label = body.getAttribute('data-gate-label') || 'cette page';

  // Empreinte FNV-1a : évite d'écrire le mot de passe en clair dans le code.
  function empreinte(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(36);
  }

  function memoire(action, valeur) {
    try {
      return action === 'lire'
        ? sessionStorage.getItem(key)
        : sessionStorage.setItem(key, valeur);
    } catch (e) {
      return null; // navigation privée : on redemandera le mot de passe
    }
  }

  if (memoire('lire') === '1') {
    body.classList.remove('locked');
    return;
  }

  var gate = document.createElement('div');
  gate.className = 'gate';
  gate.innerHTML =
    '<form class="gate-box" autocomplete="off">' +
    '<div class="gate-icon" aria-hidden="true">&#128274;</div>' +
    '<h2>Accès aux animations de ' + label + '</h2>' +
    '<p>Le mot de passe est donné en classe.</p>' +
    '<input type="password" id="gate-input" placeholder="Mot de passe" ' +
    'autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false">' +
    '<p class="gate-error" id="gate-error" role="alert" hidden>Mot de passe incorrect.</p>' +
    '<button type="submit">Entrer</button>' +
    '<a class="gate-back" href="../">&larr; Changer de niveau</a>' +
    '</form>';
  body.appendChild(gate);

  var champ = gate.querySelector('#gate-input');
  var erreur = gate.querySelector('#gate-error');
  champ.focus();

  gate.querySelector('form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (empreinte(champ.value.trim().toLowerCase()) === hash) {
      memoire('ecrire', '1');
      gate.remove();
      body.classList.remove('locked');
    } else {
      erreur.hidden = false;
      champ.value = '';
      champ.focus();
      gate.querySelector('.gate-box').classList.remove('shake');
      void gate.offsetWidth;
      gate.querySelector('.gate-box').classList.add('shake');
    }
  });
})();
