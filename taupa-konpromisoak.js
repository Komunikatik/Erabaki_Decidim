/*! Taupa konpromisoak v6.2 · activación por nombre de componente
 * Funciona en cualquier espacio participativo de Decidim. Se activa en el
 * listado y en las fichas de un componente de Propuestas cuando el nombre
 * completo del componente coincide con uno de los nombres admitidos (ver
 * componentNames). El tipo (individual / colectivo) sale del nombre; el idioma
 * activo de Decidim solo decide los textos. El nombre solo activa la interfaz:
 * la privacidad de las adhesiones debe garantizarse en el servidor.
 * Los estilos viven en taupa-konpromisoak.css (cargar con Decidim Awesome).
 */
(() => {
  "use strict";

  const key = "taupaCommitmentsRuntime";
  if (window[key]) {
    window[key].refresh();
    return;
  }
  const runtime = {
    dispose: () => {},
    refresh: boot,
  };
  // Propiedad fija: otro script no puede sustituir el runtime entre cargas.
  Object.defineProperty(window, key, {
    value: runtime,
    writable: false,
    configurable: false,
  });
  const pendingKey = "taupa:pending-commit:v2";
  const storagePrefix = "taupa:proposals:v7:";
  // Nombres completos admitidos (sin distinguir mayúsculas ni espacios).
  const componentNames = Object.freeze({
    individual: new Set([
      "norbanakoen konpromisoak",
      "compromisos individuales",
      "engagements individuels",
    ]),
    collective: new Set([
      "eragileen konpromisoak",
      "konpromiso kolektiboak",
      "compromisos colectivos",
      "engagements collectifs",
    ]),
  });
  const proposalListPath = /\/f\/(\d+)(?:\/proposals)?\/?$/;
  const proposalDetailPath = /\/f\/(\d+)\/proposals\/(\d+)\/?$/;
  const supportedLocales = ["eu", "es", "fr"];
  const localePrefixPattern = /^\/(eu|es|fr)(?=\/|$)/;

  function normalizeLocale(value) {
    if (typeof value !== "string") return null;
    const language = value.trim().toLowerCase().split(/[-_]/)[0];
    return supportedLocales.includes(language) ? language : null;
  }

  function pathLocale(path) {
    return path.match(localePrefixPattern)?.[1] || null;
  }

  function withoutLocalePrefix(path) {
    return path.replace(localePrefixPattern, "") || "/";
  }

  function sameDecidimPath(first, second) {
    if (typeof first !== "string" || typeof second !== "string") return false;
    const normalize = (path) => withoutLocalePrefix(path).replace(/\/$/, "");
    return normalize(first) === normalize(second);
  }

  function supportedLocale(page = location) {
    return (
      pathLocale(page.pathname) ||
      normalizeLocale(new URLSearchParams(page.search).get("locale")) ||
      normalizeLocale(document.documentElement.lang) ||
      "es"
    );
  }

  function sameOriginURL(value, base = location.href) {
    if (typeof value !== "string" || !value.trim()) return null;
    try {
      const url = new URL(value, base);
      return /^https?:$/.test(url.protocol) &&
        url.origin === location.origin &&
        !url.username &&
        !url.password
        ? url
        : null;
    } catch (_) {
      return null;
    }
  }

  function normalizeName(value) {
    return String(value || "")
      .normalize("NFC")
      .replace(/[​-‍⁠﻿­]/g, "")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase();
  }

  function typeForName(value) {
    const name = normalizeName(value);
    if (!name) return null;
    for (const [type, names] of Object.entries(componentNames)) {
      if (names.has(name)) return type;
    }
    return null;
  }

  // Encabezados de la página. En el listado, Decidim muestra el nombre del
  // componente en la columna lateral (no dentro de <main>), normalmente como h1.
  // Se aceptan h1/h2: solo cuenta el nombre completo, así que un título de
  // propuesta (h3 en las tarjetas) nunca puede activar la personalización.
  function listHeadingNames() {
    return [...document.querySelectorAll('h1, h2, [role="heading"]')].map(
      (heading) => heading.textContent
    );
  }

  // Entrada de la ruta de navegación que apunta al componente actual. El ID solo
  // sirve para comprobar que el enlace es el del componente de esta página.
  function breadcrumbName(componentId) {
    const links = document.querySelectorAll(
      '.layout-main__breadcrumb a[href], nav[aria-label*="readcrumb" i] a[href], .breadcrumb a[href]'
    );
    for (const link of links) {
      const url = sameOriginURL(link.getAttribute("href"));
      const match = url && withoutLocalePrefix(url.pathname).match(proposalListPath);
      if (match && match[1] === componentId) return link.textContent;
    }
    return "";
  }

  // Resuelve el tipo con el HTML ya servido, sin peticiones adicionales. El
  // título de una propuesta nunca decide la activación.
  function detectComponentType() {
    const detail = location.pathname.match(proposalDetailPath);
    const list = detail ? null : location.pathname.match(proposalListPath);
    const id = (detail || list)?.[1];
    if (!id) return null;
    const names = detail ? [breadcrumbName(id)] : [...listHeadingNames(), breadcrumbName(id)];
    for (const name of names) {
      const type = typeForName(name);
      if (type) return type;
    }
    return null;
  }
  function clearLegacyStorage() {
    try {
      localStorage.removeItem("taupa:pending-commit");
      for (let index = localStorage.length - 1; index >= 0; index--) {
        const name = localStorage.key(index);
        if (name?.startsWith(storagePrefix) || name?.startsWith("taupa:component-type:")) {
          localStorage.removeItem(name);
        }
      }
    } catch (_) {}
  }
  clearLegacyStorage();
  let currentBody = null;
  let currentRoute = null;
  function identity() {
    const profile = document.querySelector('a.dropdown__button[href*="/profiles/"]');
    if (profile) return profile.getAttribute("href");
    const signOut = document.querySelector('a[href*="sign_out"],form[action*="sign_out"]');
    return signOut ? "signed-in" : "anonymous";
  }
  function boot() {
    if (document.readyState === "loading") return;
    const canonical = new URL(location.href);
    canonical.searchParams.delete("taupa-commit");
    canonical.searchParams.delete("locale");
    canonical.hash = "";
    const route = canonical.href + "|" + supportedLocale() + "|" + identity();
    if (currentBody === document.body && currentRoute === route) return;
    runtime.dispose();
    currentBody = document.body;
    currentRoute = route;
    let pending = false;
    try {
      pending = !!sessionStorage.getItem(pendingKey);
    } catch (_) {}
    const type = detectComponentType();
    if (!type && !pending) return;
    install(type);
  }
  // "interactive" llega en cuanto Decidim termina de parsear el HTML, antes de
  // que se ejecuten sus scripts diferidos (DOMContentLoaded espera a esos
  // scripts, que son pesados). boot() ignora las llamadas repetidas.
  document.addEventListener("readystatechange", boot);
  document.addEventListener("DOMContentLoaded", boot);
  document.addEventListener("turbo:load", boot);
  document.addEventListener("turbo:before-render", () => {
    runtime.dispose();
    currentBody = null;
    currentRoute = null;
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) boot();
  });
  boot();
  function install(detectedType) {
    const lifetime = new AbortController();
    let disposed = false;
    const timers = new Set();
    const frames = new Set();
    const observers = new Set();
    // Elementos nativos que ocultamos con estilo en línea; se restauran al salir.
    const hiddenElements = new Set();
    function hideElement(element) {
      if (element.style.display === "none") return;
      element.style.display = "none";
      hiddenElements.add(element);
    }
    // Elementos que añade el script y que no deben sobrevivir al componente.
    const addedSelector = [
      ".taupa-proposal-actions",
      ".taupa-proposal-status",
      ".taupa-proposal-description",
      ".taupa-proposals-toolbar",
      ".taupa-deadline-chips",
      ".taupa-total",
      ".taupa-my-commitments-empty",
      ".taupa-detail-commit",
      ".taupa-detail-status",
      ".taupa-likers",
    ].join(",");
    let snapshotMeta = null;
    let previousCachePolicy = null;
    const setTimeout = (fn, delay) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        if (!disposed) fn();
      }, delay);
      timers.add(id);
      return id;
    };
    const clearTimeout = (id) => {
      timers.delete(id);
      window.clearTimeout(id);
    };
    const requestAnimationFrame = (fn) => {
      const id = window.requestAnimationFrame((time) => {
        frames.delete(id);
        if (!disposed) fn(time);
      });
      frames.add(id);
      return id;
    };
    class MutationObserver extends window.MutationObserver {
      constructor(fn) {
        super((...args) => {
          if (!disposed) fn(...args);
        });
        observers.add(this);
      }
    }
    function listen(target, type, handler, options = {}) {
      target.addEventListener(type, handler, {
        ...options,
        signal: lifetime.signal,
      });
    }
    function dispose() {
      disposed = true;
      lifetime.abort();
      for (const observer of observers) observer.disconnect();
      for (const id of timers) window.clearTimeout(id);
      for (const id of frames) window.cancelAnimationFrame(id);
      const dialog = document.querySelector(".taupa-consent");
      if (dialog?.open) dialog.close();
      dialog?.remove();
      document.querySelector(".taupa-toast")?.remove();
      if (snapshotMeta?.isConnected) {
        if (previousCachePolicy === null) snapshotMeta.remove();
        else snapshotMeta.content = previousCachePolicy;
      }
      // Retirar la marca y lo añadido para que nada se propague a otros espacios.
      const root = document.documentElement;
      root.classList.remove("taupa-on");
      delete root.dataset.taupaView;
      delete root.dataset.taupaType;
      for (const element of hiddenElements) element.style.removeProperty("display");
      hiddenElements.clear();
      for (const element of enhancedCards) {
        const wrapper = element.closest(".card__proposals-item");
        if (!wrapper) continue;
        wrapper.hidden = false;
        wrapper.style.removeProperty("display");
        wrapper.classList.remove("taupa-proposal-card", "spinner-container");
        wrapper.removeAttribute("aria-busy");
      }
      for (const counter of document.querySelectorAll("[data-follows-count]")) {
        if (counter.querySelector(".taupa-count")) counter.remove();
      }
      document.querySelectorAll(addedSelector).forEach((element) => element.remove());
    }
    runtime.dispose = dispose;
    function preventEnhancedSnapshot() {
      if (snapshotMeta) return;
      snapshotMeta = document.querySelector('meta[name="turbo-cache-control"]');
      if (snapshotMeta) previousCachePolicy = snapshotMeta.content;
      else {
        snapshotMeta = document.createElement("meta");
        snapshotMeta.name = "turbo-cache-control";
        document.head.append(snapshotMeta);
      }
      snapshotMeta.content = "no-cache";
    }
    const deadlineTaxonomyNames = new Set(["epeak", "plazos", "délais"]);
    const commitmentTaxonomyNames = [
      "konpromiso motak",
      "tipos de compromiso",
      "types d'engagement",
      "types d’engagement",
    ];
    const privacyPolicyPath = "/pages/pribatutasun-politika";
    const termsOfServicePath = "/pages/terms-of-service";
    const translations = {
      es: {
        partialFollow:
          "No se han podido confirmar todos los seguimientos. El compromiso sí está registrado.",
        partialWithdraw:
          "El compromiso está retirado, pero no se ha podido confirmar la retirada del seguimiento.",
        newsletterError:
          "El compromiso está registrado, pero no se ha podido confirmar la suscripción al boletín.",
        paginationError: "No se han podido cargar todas las páginas. Vuelve a intentarlo.",
        commit: "Me comprometo",
        committed: "Comprometido",
        withdraw: "Retirar mi compromiso",
        comments: {
          one: "%{count} comentario",
          other: "%{count} comentarios",
        },
        mineSection: "Mis compromisos",
        emptyFilters: "No hay ningún compromiso con este criterio.",
        total: {
          zero: "Todavía no se ha adquirido ningún compromiso",
          one: "Ya se ha adquirido 1 compromiso",
          other: "Ya se han adquirido %{count} compromisos",
        },
        consentTitle: "¡Un gran paso por el euskera!",
        consentIntro: "Al asumir este compromiso, Taupa te acompañará:",
        consentAccept: "Sí, me comprometo",
        consentBody: "Recibirás correos sobre este compromiso.",
        consentSpace: "Seguirás este espacio y estarás al día de su actividad.",
        consentWithdraw: "Puedes echarte atrás cuando quieras.",
        consentPrivacy: "Política de privacidad",
        consentTerms: "Términos y condiciones de uso",
        consentCancel: "Ahora no",
        consentLogin: "Inicia sesión para confirmar el compromiso.",
        consentNewsletter: "Al confirmar, se activará el envío del boletín de Taupa en tu cuenta.",
        newsletterDone: "Te has suscrito al boletín.",
        commitDone: "¡Compromiso adquirido!",
        commitPending: "Registrando el compromiso…",
        withdrawDone: "Has retirado tu compromiso.",
        deadlineAll: "Todos",
        orderShort: "Orden",
        order: "Ordenar compromisos por",
        orders: {
          most_liked: "Más compromisos",
        },
        filterError: "No se han podido comprobar todos los compromisos.",
        commitError: "Se ha producido un error al seguir este recurso.",
        withdrawError: "Se ha producido un error al dejar de seguir este recurso.",
      },
      eu: {
        partialFollow: "Ezin izan dira jarraipen guztiak berretsi. Konpromisoa erregistratuta dago.",
        partialWithdraw:
          "Konpromisoa baliogabetuta dago, baina ezin izan da jarraipena etetea berretsi.",
        newsletterError:
          "Konpromisoa erregistratuta dago, baina ezin izan da buletinaren harpidetza berretsi.",
        paginationError: "Ezin izan dira orrialde guztiak kargatu. Saiatu berriro.",
        commit: "Konpromisoa hartu",
        committed: "Konpromisoa hartuta",
        withdraw: "Konpromisoa baliogabetu",
        comments: {
          one: "Iruzkin bat",
          other: "%{count} iruzkin",
        },
        mineSection: "Nire konpromisoak",
        emptyFilters: "Ez dago konpromisorik irizpide honekin.",
        total: {
          zero: "Oraindik ez da konpromisorik hartu",
          one: "Dagoeneko konpromiso bat hartu da",
          other: "Dagoeneko %{count} konpromiso hartu dira",
        },
        consentTitle: "Pauso handia euskararen alde!",
        consentIntro: "Konpromiso hau hartzean, Taupa zure bidelagun izango da:",
        consentAccept: "Bai, konpromisoa hartzen dut",
        consentBody: "Konpromiso honi buruzko mezuak jasoko dituzu posta elektronikoz.",
        consentSpace: "Espazio hau jarraituko duzu, eta bere berri izango duzu.",
        consentWithdraw: "Nahi duzunean atzera egin dezakezu.",
        consentPrivacy: "Pribatutasun-politika",
        consentTerms: "Zerbitzuaren baldintzak",
        consentCancel: "Orain ez",
        consentLogin: "Hasi saioa konpromisoa berresteko.",
        consentNewsletter:
          "Konpromisoa baieztatzean, Tauparen buletina jasotzeko ezarpena aktibatuko da zure kontuan.",
        newsletterDone: "Buletinera harpidetu zara.",
        commitDone: "Konpromisoa hartuta!",
        commitPending: "Konpromisoa erregistratzen…",
        withdrawDone: "Konpromisoa baliogabetu duzu.",
        deadlineAll: "Guztiak",
        orderShort: "Ordena",
        order: "Antolatu konpromisoak honen arabera",
        orders: {
          most_liked: "Konpromiso gehien",
        },
        filterError: "Ezin izan dira konpromiso guztiak egiaztatu.",
        commitError: "Arazo bat egon da baliabide hau jarraitzean.",
        withdrawError: "Arazo bat egon da baliabide hau jarraitzeari uztean.",
      },
      fr: {
        partialFollow:
          "Tous les suivis n’ont pas pu être confirmés. L’engagement est bien enregistré.",
        partialWithdraw: "L’engagement est retiré, mais l’arrêt du suivi n’a pas pu être confirmé.",
        newsletterError:
          "L’engagement est enregistré, mais l’abonnement au bulletin n’a pas pu être confirmé.",
        paginationError: "Toutes les pages n’ont pas pu être chargées. Veuillez réessayer.",
        commit: "Je m'engage",
        committed: "Engagement pris",
        withdraw: "Retirer mon engagement",
        comments: {
          one: "%{count} commentaire",
          other: "%{count} commentaires",
        },
        mineSection: "Mes engagements",
        emptyFilters: "Aucune proposition ne correspond à ce critère.",
        total: {
          zero: "Aucun engagement n'a encore été pris",
          one: "1 engagement a déjà été pris",
          other: "%{count} engagements ont déjà été pris",
        },
        consentTitle: "Un grand pas pour l'euskara !",
        consentIntro: "En prenant cet engagement, Taupa vous accompagne :",
        consentAccept: "Oui, je m'engage",
        consentBody: "Vous recevrez des e-mails sur cet engagement.",
        consentSpace: "Vous suivrez cet espace et son actualité.",
        consentWithdraw: "Vous pouvez revenir en arrière à tout moment.",
        consentPrivacy: "Politique de confidentialité",
        consentTerms: "Conditions d'utilisation",
        consentCancel: "Pas maintenant",
        consentLogin: "Connectez-vous pour confirmer votre engagement.",
        consentNewsletter: "En confirmant, vous activez l’envoi du bulletin de Taupa sur votre compte.",
        newsletterDone: "Abonnement au bulletin confirmé.",
        commitDone: "Engagement pris !",
        commitPending: "Enregistrement de l’engagement…",
        withdrawDone: "Vous avez retiré votre engagement.",
        deadlineAll: "Tous",
        orderShort: "Ordre",
        order: "Classement des propositions par",
        orders: {
          most_liked: "Plus d'engagements",
        },
        filterError: "Impossible de vérifier tous les engagements.",
        commitError:
          "Une erreur s'est produite lors du traitement de votre demande de suivre ce contenu.",
        withdrawError:
          "Une erreur s'est produite lors du traitement de votre demande de ne plus suivre ce contenu.",
      },
    };
    const componentTranslations = {
      collective: {
        es: {
          commitments: {
            zero: "¡Sé el primer agente!",
            one: "%{count} agente comprometido",
            other: "%{count} agentes comprometidos",
          },
          committersTitle: "Agentes comprometidos",
          mineSection: "Nuestros compromisos",
          consentPublic: "Tu nombre aparecerá en el compromiso, junto a otros agentes.",
        },
        eu: {
          commitments: {
            zero: "Izan zaitez lehen eragilea!",
            one: "Eragile batek konpromisoa hartu du",
            other: "%{count} eragilek konpromisoa hartu dute",
          },
          committersTitle: "Konpromisoa hartu duten eragileak",
          mineSection: "Gure konpromisoak",
          consentPublic: "Zure izena konpromisoan agertuko da, beste eragileekin batera.",
        },
        fr: {
          commitments: {
            zero: "Soyez le premier acteur !",
            one: "%{count} acteur engagé",
            other: "%{count} acteurs engagés",
          },
          committersTitle: "Acteurs engagés",
          mineSection: "Nos engagements",
          consentPublic: "Votre nom apparaîtra sur la proposition, avec les autres acteurs.",
        },
      },
      individual: {
        es: {
          commitments: {
            zero: "¡Sé la primera persona!",
            one: "%{count} persona comprometida",
            other: "%{count} personas comprometidas",
          },
          consentPublic:
            "Tu nombre no aparecerá en el compromiso (quien te sigue puede recibir un aviso).",
        },
        eu: {
          commitments: {
            zero: "Izan zaitez lehena!",
            one: "Pertsona batek konpromisoa hartu du",
            other: "%{count} pertsonak konpromisoa hartu dute",
          },
          consentPublic:
            "Zure izena ez da konpromisoan agertuko (jarraitzen zaituztenek abisua jaso dezakete).",
        },
        fr: {
          commitments: {
            zero: "Soyez la première personne !",
            one: "%{count} personne engagée",
            other: "%{count} personnes engagées",
          },
          consentPublic:
            "Votre nom n'apparaîtra pas sur l'engagement (vos abonnés peuvent recevoir un avis).",
        },
      },
    };
    const deadlineLabels = {
      shortTerm: ["urte batera", "a un año", "a 1 año", "à un an", "à 1 an", "dans un an"],
      longTerm: [
        "bost urtetara",
        "a cinco años",
        "a 5 años",
        "à cinq ans",
        "à 5 ans",
        "dans cinq ans",
      ],
      hidden: ["norbanakoa", "individual", "individuel", "individuelle"],
    };
    const counterCacheMaxAge = 6e5;
    const descriptionCacheMaxAge = 864e5;
    const proposalCacheMaxAge = 6e4;
    const commitmentReturnParam = "taupa-commit";
    const proposalCachePrefix = "taupa:proposals:v8:";
    const supportedOrderKeys = [
      "most_liked",
      "alphabetical",
      "reverse_alphabetical",
      "most_commented",
    ];
    const orderLabelPatterns = [
      [/^a\s*-\s*z\b/i, "alphabetical"],
      [/^z\s*-\s*a\b/i, "reverse_alphabetical"],
    ];
    const hiddenFilterIds = ["state", "origin", "activity"];
    const proposalCardSelector =
      '#proposals .card__proposals-item > .card__grid[id^="proposals__proposal_"]';
    const spaceFollowSelector = ["assembly", "participatory_process", "conference", "initiative"]
      .map((e) => `[id^="follow_${e}_"]`)
      .join(",");
    const cardStateByElement = new WeakMap();
    const enhancedCards = new Set();
    // Límites de seguridad: la carga prevista no supera 25 propuestas.
    const maxTotalScanPages = 4;
    const maxPaginationPages = 5;
    const maxResponseChars = 3e6;
    // La carga prevista es de unas 25 propuestas: se pueden pedir todas a la vez.
    const maxParallelPageReads = 6;
    const maxEagerCards = 25;
    let session = {
        component: null,
        locale: "es",
        logged: false,
        user: null,
      },
      componentType = null,
      showMyCommitments = false,
      proposalAliasQueriesFailed = false,
      filtersRenderScheduled = false,
      listRenderScheduled = false,
      listObserver = null,
      listObserverTarget = null,
      iconSpritePath = null,
      loadedCache = null,
      cacheWriteScheduled = false,
      nativeAjaxCount = 0,
      nativeAjaxTimer = null;
    const message = (e) =>
      componentTranslations[componentType]?.[session.locale]?.[e] ?? translations[session.locale][e];
    function formatCount(key, count) {
      const forms = message(key);
      const template =
        count === 0 && forms.zero ? forms.zero : count === 1 ? forms.one : forms.other;
      return template.replace(/%\{count\}/g, String(count));
    }
    function normalizeLabel(e) {
      return e
        .normalize("NFC")
        .replace(/[​-‍⁠﻿­]/g, "")
        .trim()
        .replace(/\s+/g, " ")
        .toLocaleLowerCase();
    }
    function decidimConfig(e) {
      try {
        return window.Decidim?.config?.get(e) || null;
      } catch (e) {
        return null;
      }
    }
    function currentComponentId() {
      return location.pathname.match(proposalListPath)?.[1] || null;
    }
    function activeLocalePrefix() {
      const language = pathLocale(location.pathname);
      return language ? "/" + language : "";
    }

    function localizedURL(path, query = {}) {
      const url = new URL(path, location.origin);
      if (!pathLocale(url.pathname)) url.searchParams.set("locale", supportedLocale());
      for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
      return url.href;
    }
    function proposalURL(e, t) {
      const n = location.pathname,
        o = n.indexOf("/f/");
      return localizedURL(`${o >= 0 ? n.slice(0, o) : ""}/f/${e}/proposals/${t}`);
    }
    // Los estilos están en taupa-konpromisoak.css. El script solo marca la
    // página; si el JS falla, la interfaz nativa permanece visible.
    function markEnhanced(type, view) {
      const root = document.documentElement;
      root.dataset.taupaType = type;
      root.dataset.taupaView = view;
      root.classList.add("taupa-on");
    }
    function withLocaleFallbacks(e) {
      return [e, ...supportedLocales.filter((t) => t !== e)];
    }
    function proposalFields(includeBody, includeLikes = false) {
      const body = includeBody ? " body { translations(locales: $locales) { locale text } }" : "";
      // Con sesión iniciada, la lista de "likes" permite saber en la misma consulta
      // si el compromiso es mío, sin descargar la página de cada propuesta.
      const likes = includeLikes ? " likes { nickname }" : "";
      return "id likesCount" + likes + body;
    }
    function proposalListQuery(includeBody) {
      const translations = includeBody ? ", $locales: [String!]" : "";
      return (
        `query($componentId: ID!${translations}, $after: String) {` +
        " component(id: $componentId) { ... on Proposals { proposals(first: 50, after: $after) {" +
        ` pageInfo { hasNextPage endCursor } edges { node { ${proposalFields(
          includeBody
        )} } } } } } }`
      );
    }
    function unprefixedPath() {
      return withoutLocalePrefix(location.pathname);
    }
    function accountProfileLink(doc = document) {
      return doc.querySelector('a.dropdown__button[href*="/profiles/"]');
    }
    function accountKey(doc = document) {
      const e = accountProfileLink(doc),
        t = e && new URL(e.href, location.origin).pathname.split("/profiles/")[1]?.split("/")[0];
      return e && sameOriginURL(e.getAttribute("href")) && t ? "nick:" + t : null;
    }
    function requireSameAccount(expected, doc = document) {
      if (!expected || accountKey(doc) !== expected || accountKey() !== expected) {
        throw new Error("Decidim account could not be confirmed");
      }
    }
    // El token CSRF solo se lee del <head>: un <meta> inyectado en el <body>
    // (contenido ciudadano) no debe poder sustituirlo.
    function csrfToken() {
      return document.head.querySelector('meta[name="csrf-token"]')?.content || null;
    }
    function refreshSession() {
      const e = !!document.querySelector('a[href*="sign_out"], form[action*="sign_out"]');
      session = {
        component: currentComponentId(),
        locale: supportedLocale(),
        logged: e,
        user: e ? accountKey() : null,
      };
    }
    function visibleCardStates() {
      const e = [];
      for (const t of enhancedCards) {
        if (!t.isConnected) {
          enhancedCards.delete(t);
          cardVisibilityObserver?.unobserve?.(t);
          continue;
        }
        const n = cardStateByElement.get(t);
        if (n) {
          e.push(n);
        }
      }
      return e;
    }
    const delay = (e) => new Promise((t) => setTimeout(t, e));
    async function requestWithTimeout(url, options, timeout) {
      if (disposed) throw new DOMException("Navigation cancelled", "AbortError");
      const controller = new AbortController();
      const abort = () => controller.abort();
      lifetime.signal.addEventListener("abort", abort, {
        once: true,
      });
      const timer = window.setTimeout(abort, timeout);
      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });
        // Fetch resolves at headers; include response body consumption in the timeout.
        const body = await response.text();
        if (body.length > maxResponseChars) throw new Error("Response too large");
        if (disposed) throw new DOMException("Navigation cancelled", "AbortError");
        return {
          ok: response.ok,
          status: response.status,
          type: response.type,
          redirected: response.redirected,
          url: response.url,
          headers: response.headers,
          text: async () => body,
          json: async () => JSON.parse(body),
        };
      } finally {
        window.clearTimeout(timer);
        lifetime.signal.removeEventListener("abort", abort);
      }
    }
    let cachedOrderLabel;
    function proposalOrderLabel() {
      cachedOrderLabel ||= document
        .querySelector("#dropdown-trigger-order > span")
        ?.textContent.trim()
        .replace(/\s+/g, " ")
        .replace(/:$/, "");
      return cachedOrderLabel || message("order");
    }

    function installListStyles() {
      preventEnhancedSnapshot();
    }
    function proposalCacheKey() {
      return `${proposalCachePrefix}${session.component}:${session.locale}`;
    }
    function proposalCache() {
      if (loadedCache?.key === proposalCacheKey()) return loadedCache.data;
      let e = null;
      try {
        e = JSON.parse(localStorage.getItem(proposalCacheKey()) || "null");
      } catch (_) {}
      if (!(e && "object" == typeof e.items)) {
        e = {
          user: null,
          items: {},
        };
      }
      loadedCache = {
        key: proposalCacheKey(),
        data: e,
      };
      if (session.logged) {
        if (session.user) {
          setCacheAccount(session.user);
          restoreMineFromSession(e);
        }
      } else {
        setCacheAccount(null);
      }
      return e;
    }
    function updateProposalCache(e, t) {
      if ("m" in t && session.user) saveMineToSession(session.component, e, t.m, t.mt);
      const n = proposalCache().items,
        o = n[e] || {};
      n[e] = {
        ...o,
        ...t,
        t: "f" in t ? Date.now() : o.t || 0,
      };
      delete n[e].stale;
      scheduleCacheWrite();
    }
    // Mis compromisos: solo en sessionStorage (se borra al cerrar la pestaña) y
    // por cuenta, para que al volver al listado los botones salgan al instante.
    const mineSessionKey = (component) => `taupa:mine:v1:${component}:${session.user}`;
    function restoreMineFromSession(cache) {
      try {
        const saved = JSON.parse(sessionStorage.getItem(mineSessionKey(session.component)) || "null");
        if (!saved || typeof saved !== "object") return;
        for (const [id, entry] of Object.entries(saved)) {
          if (!/^\d+$/.test(id) || !Array.isArray(entry)) continue;
          if (typeof entry[0] !== "boolean" || !Number.isFinite(entry[1])) continue;
          const item = (cache.items[id] ||= {});
          item.m = entry[0];
          item.mt = entry[1];
        }
      } catch (_) {}
    }
    function saveMineToSession(component, id, value, time) {
      if (!session.user || !component || typeof value !== "boolean") return;
      try {
        const key = mineSessionKey(component);
        const saved = JSON.parse(sessionStorage.getItem(key) || "null") || {};
        saved[id] = [value, Number.isFinite(time) ? time : Date.now()];
        sessionStorage.setItem(key, JSON.stringify(saved));
      } catch (_) {}
    }
    function setCacheAccount(e) {
      const t = loadedCache.data;
      if (t.user !== e) {
        t.user = e;
        Object.values(t.items).forEach((e) => {
          delete e.m;
          delete e.mt;
        });
        scheduleCacheWrite();
      }
    }
    const scheduleIdleWork = window.requestIdleCallback
      ? (e) =>
          window.requestIdleCallback(e, {
            timeout: 2e3,
          })
      : (e) => setTimeout(e, 500);
    function scheduleCacheWrite() {
      if (!cacheWriteScheduled) {
        cacheWriteScheduled = true;
        scheduleIdleWork(flushProposalCache);
      }
    }
    function flushProposalCache() {
      if (cacheWriteScheduled) {
        cacheWriteScheduled = false;
        if (disposed || session.logged) return;
        const e = proposalCache(),
          t = Object.keys(e.items);
        if (t.length > 400) {
          const n = (e) => Math.max(e.t || 0, e.dt || 0, e.mt || 0);
          t.sort((t, o) => n(e.items[t]) - n(e.items[o]))
            .slice(0, t.length - 400)
            .forEach((t) => delete e.items[t]);
        }
        try {
          const items = Object.fromEntries(
            Object.entries(e.items).map(([id, item]) => {
              const publicData = {
                ...item,
              };
              delete publicData.m;
              delete publicData.mt;
              return [id, publicData];
            })
          );
          localStorage.setItem(
            proposalCacheKey(),
            JSON.stringify({
              ...e,
              user: null,
              items,
            })
          );
        } catch (e) {}
      }
    }
    function getIconSprite() {
      if (!iconSpritePath) {
        const e = document.querySelector('use[href*="remixicon.symbol"]');
        iconSpritePath =
          e?.getAttribute("href").split("#")[0] ||
          decidimConfig("icons_path") ||
          "/decidim-packs/media/images/remixicon.symbol-4fb70727220f022f5864.svg";
      }
      return iconSpritePath;
    }
    function createIcon(e) {
      const t = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      t.setAttribute("width", "1em");
      t.setAttribute("height", "1em");
      t.setAttribute("aria-hidden", "true");
      t.setAttribute("fill", "currentColor");
      const n = document.createElementNS(t.namespaceURI, "use");
      n.setAttribute("href", getIconSprite() + "#ri-" + e);
      t.append(n);
      return t;
    }
    function renderCardButton(e) {
      if (disposed) return;
      const { button: t } = e,
        n = e.known && true === e.following;
      t.classList.toggle("button__primary", n);
      t.classList.toggle("button__secondary", !n);
      t.dataset.active = e.known ? String(n) : "unknown";
      if (e.known) {
        t.setAttribute("aria-pressed", String(n));
      } else {
        t.removeAttribute("aria-pressed");
      }
      t.disabled = e.busy || e.unavailable;
      const o = n ? (e.hovered ? "withdraw" : "committed") : "commit",
        a = `${o}|${session.locale}|${e.title}`;
      if (e.labelKey === a) return;
      e.labelKey = a;
      const r = document.createElement("span");
      r.className = "taupa-label-stack";
      for (const e of ["commit", "committed", "withdraw"]) {
        const t = document.createElement("span");
        if ((t.append(document.createTextNode(message(e))), "commit" !== e)) {
          const e = createIcon("check-line");
          e.classList.add("already-voted-icon");
          t.append(e);
        }
        if (e !== o) {
          t.setAttribute("aria-hidden", "true");
        }
        r.append(t);
      }
      const i = document.createElement("span");
      i.className = "sr-only";
      i.textContent = e.title;
      t.replaceChildren(r, i);
    }
    function setCardCommitment(e, t, n = false, inferred = false) {
      e.following = t;
      e.login = n;
      e.known = true;
      e.recheck = false;
      e.inferredFromCount = inferred;
      renderCardButton(e);
      if (!n && !inferred && session.user) {
        updateProposalCache(e.id, {
          m: t,
          mt: Date.now(),
        });
      }
      scheduleFilterRender();
    }
    function markCardUnavailable(e) {
      e.unavailable = true;
      e.known = true;
      e.following = false;
      e.login = true;
      e.recheck = false;
      renderCardButton(e);
      scheduleFilterRender();
    }
    listen(window, "pagehide", () => flushProposalCache());
    const counterLabels = {
        follows: (e) => formatCount("commitments", e),
        comments: (e) => formatCount("comments", e),
      },
      counterIcons = {
        follows: "check-line",
        comments: "wechat-line",
      },
      counterOrder = ["follows", "comments"];
    function createCounterContents(e, t) {
      const n = e.querySelector("svg") || createIcon(counterIcons[t]),
        o = document.createElement("span");
      o.className = "taupa-count";
      const a = document.createElement("span");
      a.className = "sr-only";
      e.replaceChildren(n, o, a);
      return e;
    }
    function renderCardCounter(e, t, n) {
      if (!Number.isInteger(n) || n < 0) return;
      if (e.counts[t] === n && e.counters[t]) return;
      e.counts[t] = n;
      const o =
        e.counters[t] ||
        ((e, t) => {
          if (!e.metadata) return null;
          const n = createCounterContents(document.createElement("div"), t);
          n.setAttribute(`data-${t}-count`, "");
          ((e, t, n) => {
            const o = counterOrder.indexOf(t),
              a = (t) => e.counters[t]?.parentElement === e.metadata,
              r = counterOrder.slice(o + 1).find(a),
              i = counterOrder.slice(0, o).reverse().find(a);
            if (r) {
              e.counters[r].before(n);
            } else {
              if (i) {
                e.counters[i].after(n);
              } else {
                e.metadata.append(n);
              }
            }
          })(e, t, n);
          e.counters[t] = n;
          return n;
        })(e, t);
      if (!o) return;
      const a = counterLabels[t](n);
      o.querySelector(".taupa-count").textContent = a;
      o.querySelector(".sr-only").textContent = "";
      o.hidden = "follows" !== t && 0 === n;
      if ("follows" === t) {
        o.classList.toggle("taupa-first", 0 === n);
      }
    }
    function extractProposalText(e) {
      const content = parseHTML(e);
      const n = content.children,
        o = [];
      for (const e of n) {
        if (e.matches("hr,h1,h2,h3")) break;
        const t = e.textContent.trim();
        if (t) {
          o.push(t);
        }
      }
      return o.join(" ") || (n.length ? "" : content.textContent.trim());
    }
    function truncateDescription(e) {
      return e.length > 301 ? e.slice(0, 300).replace(/\s+\S*$/, "") + "…" : e;
    }
    function renderCardDescription(e, t) {
      const { description: n } = e;
      e.hasDescription = true;
      const o = truncateDescription(t);
      if (n.textContent !== o) {
        n.textContent = o;
      }
      n.hidden = !o;
    }
    const apiJobs = [];
    let activeApiJobs = 0,
      dataLoadScheduled = false;
    function scheduleCardDataLoad(e = false) {
      if (e) return loadCardData();
      if (!dataLoadScheduled) {
        dataLoadScheduled = true;
        queueMicrotask(() => {
          dataLoadScheduled = false;
          loadCardData();
        });
      }
    }
    function loadCardData() {
      const cards = visibleCardStates().filter((card) => {
        if (card.dataRequested) return false;
        if (
          Date.now() - card.cacheTime < proposalCacheMaxAge &&
          card.hasDescription &&
          Number.isInteger(card.counts.follows)
        ) {
          card.dataRequested = true;
          refreshCardCommitment(card);
          return false;
        }
        return true;
      });
      queueProposalAliasQueries(cards);
      runAPIQueue();
      scheduleTotalScan();
    }

    let apiRetryTimer = null;
    function scheduleApiRetry() {
      if (apiRetryTimer || disposed) return;
      apiRetryTimer = setTimeout(() => {
        apiRetryTimer = null;
        proposalAliasQueriesFailed = false;
        totalScanFinished = false;
        for (const item of visibleCardStates()) {
          item.dataRequested = false;
          item.cacheTime = 0;
          item.recheck = session.logged;
        }
        scheduleCardDataLoad();
      }, 30000);
    }
    let totalScanFinished = false;
    let totalScanTimer = null;
    let totalScanRunning = false;
    const proposalCounts = new Map();
    let allCountsLoaded = false;
    function renderCommitmentTotal() {
      let e = null;
      const t = proposalCache();
      if (
        (allCountsLoaded
          ? ((e = 0),
            proposalCounts.forEach((t) => {
              e += t;
            }),
            (t.total?.n !== e || Date.now() - t.total.t > proposalCacheMaxAge) &&
              ((t.total = {
                n: e,
                t: Date.now(),
              }),
              scheduleCacheWrite()))
          : t.total && Date.now() - t.total.t <= counterCacheMaxAge && (e = t.total.n),
        null === e)
      )
        return;
      let n = document.querySelector("#proposals .taupa-total");
      if (!n) {
        const e = findOrCreateListToolbar();
        if (!e) return;
        n = document.createElement("p");
        n.className = "flex items-center gap-2 mt-2 text-gray-2 taupa-total";
        e.before(n);
      }
      const o = formatCount("total", e);
      if (n.textContent !== o) {
        n.replaceChildren(createIcon("check-line"), document.createTextNode(o));
      }
    }
    function queueProposalAliasQueries(e, t = false) {
      for (let n = 0; n < e.length; n += maxEagerCards) {
        const o = e.slice(n, n + maxEagerCards);
        queueProposalData(o, t || o.some((e) => !e.hasDescription));
      }
    }
    function queueProposalData(e, n) {
      const o = {
        chunk: e,
        withBody: n,
      };
      o.promise = new Promise((e) => {
        o.done = e;
      });
      e.forEach((e) => {
        e.dataRequested = true;
        e.dataPromise = o.promise;
      });
      apiJobs.push(o);
    }
    function runAPIQueue() {
      for (; activeApiJobs < 4 && apiJobs.length; ) {
        const e = apiJobs.shift();
        activeApiJobs++;
        loadProposalAliasData(e.chunk, e.withBody).finally(() => {
          activeApiJobs--;
          e.done();
          runAPIQueue();
        });
      }
    }
    function scheduleTotalScan() {
      const cached = proposalCache().total;
      if (
        disposed ||
        totalScanTimer ||
        totalScanRunning ||
        totalScanFinished ||
        (cached && Date.now() - cached.t < proposalCacheMaxAge)
      )
        return;
      totalScanTimer = setTimeout(() => {
        totalScanTimer = null;
        if (activeApiJobs || apiJobs.length) {
          scheduleTotalScan();
          return;
        }
        loadTotalCounts();
      }, 600);
    }

    async function loadTotalCounts() {
      totalScanRunning = true;
      const startedAt = Date.now();
      const counts = new Map();
      try {
        let after = null;
        for (let page = 0; page < maxTotalScanPages && !disposed; page++) {
          const { component } = await queryComponentProposals(
            proposalListQuery(false),
            { after },
            false,
            "low"
          );
          if (!component.proposals) throw new Error("Proposal totals unavailable");
          for (const { node } of component.proposals.edges) {
            counts.set(String(node.id), Number(node.likesCount) || 0);
          }
          const { endCursor, hasNextPage } = component.proposals.pageInfo;
          if (!hasNextPage || !endCursor) {
            for (const card of visibleCardStates()) {
              if (card.actedAt > startedAt && Number.isInteger(card.counts.follows)) {
                counts.set(card.id, card.counts.follows);
              }
            }
            proposalCounts.clear();
            for (const [id, count] of counts) proposalCounts.set(id, count);
            allCountsLoaded = true;
            renderCommitmentTotal();
            break;
          }
          after = endCursor;
        }
      } catch (error) {
        if (!disposed) console.warn("Taupa API (total):", error);
      } finally {
        totalScanFinished = true;
        totalScanRunning = false;
      }
    }

    async function loadProposalAliasData(e, t) {
      const n = e.filter((e) => e.card.isConnected);
      if (!n.length) return;
      if (proposalAliasQueriesFailed) {
        loadCardsFromDetail(n);
        return;
      }
      const o = Date.now(),
        a = n.map((e) => e.id);
      try {
        let e;
        const withLikes = session.logged && !!session.user;
        try {
          e = await queryProposalAliases(a, t, withLikes);
        } catch (n) {
          await delay(1500);
          e = await queryProposalAliases(a, t, withLikes);
        }
        applyProposalData(n, e, o);
      } catch (e) {
        console.warn("Taupa API:", e);
        proposalAliasQueriesFailed = true;
        scheduleApiRetry();
        loadCardsFromDetail(n);
      }
    }
    function queryProposalAliases(e, t, includeLikes = false) {
      const n = proposalFields(t, includeLikes),
        o = e.map((e) => `p${e}: proposal(id: "${e}") { ${n} }`).join(" ");
      return queryComponentProposals(
        `query($componentId: ID!${t ? ", $locales: [String!]" : ""}) {` +
          ` component(id: $componentId) { ... on Proposals { ${o} } } }`,
        {},
        t
      );
    }
    function queryComponentProposals(e, t, n, priority) {
      return queryGraphQL(
        e,
        {
          componentId: session.component,
          ...(n
            ? {
                locales: withLocaleFallbacks(session.locale),
              }
            : {}),
          ...t,
        },
        priority
      );
    }
    async function queryGraphQL(e, t, priority = "high") {
      const endpoint = sameOriginURL(decidimConfig("api_path") || "/api");
      if (!endpoint) throw new Error("Unexpected API origin");
      const n = await requestWithTimeout(
        endpoint.href,
        {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          priority,
          redirect: "error",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            query: e,
            variables: t,
          }),
        },
        1e4
      );
      if (!n.ok) throw new Error("HTTP " + n.status);
      if (!/json/i.test(n.headers.get("content-type") || "")) {
        throw new Error("Unexpected API content type");
      }
      const o = await n.json();
      if (!o.data?.component)
        throw new Error(o.errors?.map((e) => e.message).join("; ") || "Proposal data unavailable");
      return o.data;
    }
    function applyProposalData(cards, data, requestedAt) {
      if (disposed) return;
      for (const card of cards) {
        const proposal = data.component["p" + card.id];
        if (!proposal) {
          refreshCardCommitment(card, true);
          continue;
        }
        const changed = card.busy || card.actedAt > requestedAt;
        if (!changed && Number.isInteger(proposal.likesCount)) {
          renderCardCounter(card, "follows", proposal.likesCount);
          updateProposalCache(card.id, { f: proposal.likesCount });
          if (allCountsLoaded) proposalCounts.set(card.id, proposal.likesCount);
        }

        if (!changed && Array.isArray(proposal.likes)) applyLikesToCard(card, proposal);

        if (Object.hasOwn(proposal, "body")) {
          const bodies = proposal.body?.translations || [];
          const translated = bodies.find(
            (entry) => normalizeLocale(entry.locale) === session.locale && entry.text
          );
          const body = (translated || bodies.find((entry) => entry.text))?.text;
          renderCardDescription(card, body ? extractProposalText(body) : "");
          updateProposalCache(card.id, { d: card.description.textContent, dt: Date.now() });
        }
        if (!changed) refreshCardCommitment(card, !card.hasDescription);
      }
      if (allCountsLoaded) renderCommitmentTotal();
      scheduleFilterRender();
    }
    // Un compromiso es mío si mi nick está entre los "likes". La ausencia solo
    // se da por válida si la lista está completa (si la API oculta nombres, la
    // tarjeta queda sin resolver y se consulta su ficha como antes).
    function applyLikesToCard(card, proposal) {
      const mine = session.user?.startsWith("nick:") ? session.user.slice(5).toLowerCase() : null;
      if (!mine || card.busy || card.unavailable) return;
      const nicknames = proposal.likes.map((like) => String(like?.nickname || "").toLowerCase());
      const found = nicknames.includes(mine);
      const complete = Number.isInteger(proposal.likesCount) && nicknames.length === proposal.likesCount;
      if (found || complete) setCardCommitment(card, found);
    }
    const pageJobs = [],
      pageCache = new Map();
    let activePageJobs = 0;
    function parseHTML(html) {
      const template = document.createElement("template");
      template.innerHTML = html;
      return template.content;
    }
    const htmlTags = new Set(
      "a article button dd dialog div dl dt em figcaption figure form h1 h2 h3 h4 h5 h6 img input label li ol p section small span strong time ul".split(
        " "
      )
    );
    const htmlAttributes = new Set(
      "alt aria-controls aria-current aria-describedby aria-expanded aria-hidden aria-label aria-labelledby aria-modal aria-pressed checked class data-author data-comments-count data-dialog data-dialog-close data-dialog-open data-dialog-title data-follows-count data-likes-count data-method data-remote data-tags data-taxon disabled for height hidden id loading method name role tabindex title type value width".split(
        " "
      )
    );
    // En modo no interactivo se descartan formularios, botones y atributos que
    // el rails-ujs de Decidim activaría (data-remote, data-method, data-dialog-*).
    const interactiveTags = new Set(["button", "dialog", "form", "input"]);
    const interactiveAttributes = new Set([
      "checked",
      "data-dialog",
      "data-dialog-close",
      "data-dialog-open",
      "data-dialog-title",
      "data-method",
      "data-remote",
      "disabled",
      "for",
      "method",
      "name",
      "type",
      "value",
    ]);
    function importDecidimFragment(source, base, { interactive = false } = {}) {
      if (source.nodeType === Node.TEXT_NODE) return document.createTextNode(source.textContent);
      if (source.nodeType !== Node.ELEMENT_NODE) return null;
      const { localName, namespaceURI } = source;
      const svg = namespaceURI === "http://www.w3.org/2000/svg";
      if (
        svg
          ? !["svg", "use"].includes(localName)
          : namespaceURI !== "http://www.w3.org/1999/xhtml" || !htmlTags.has(localName)
      )
        return null;
      if (!interactive && interactiveTags.has(localName)) return null;
      const result = svg
        ? document.createElementNS(namespaceURI, localName)
        : document.createElement(localName);
      for (const { name, value } of source.attributes) {
        if (!interactive && interactiveAttributes.has(name)) continue;
        const link =
          (localName === "a" && name === "href") ||
          (localName === "img" && name === "src") ||
          (localName === "form" && name === "action") ||
          (localName === "use" && (name === "href" || name === "xlink:href"));
        if (link) {
          const target = sameOriginURL(value, base);
          if (target) result.setAttribute(name === "xlink:href" ? "href" : name, target.href);
        } else if (htmlAttributes.has(name) || (svg && name === "viewBox")) {
          result.setAttribute(name, value);
        }
      }
      for (const child of source.childNodes) {
        const imported = importDecidimFragment(child, base, { interactive });
        if (imported) result.append(imported);
      }
      return result;
    }
    function readDecidimPage(url, { fresh = false, urgent = false, needed = null } = {}) {
      if (!sameOriginURL(url)) return Promise.reject(new Error("Unexpected Decidim read target"));
      const cached = pageCache.get(url);
      if (!fresh && cached && Date.now() - cached.time < 20_000) {
        if (urgent) prioritizePageRead(url);
        return cached.promise;
      }

      const promise = new Promise((resolve, reject) => {
        const job = { url, urgent, needed, resolve, reject };
        if (urgent) pageJobs.unshift(job);
        else pageJobs.push(job);
        runPageQueue();
      });
      pageCache.set(url, { promise, time: Date.now() });
      const discard = () => {
        if (pageCache.get(url)?.promise === promise) pageCache.delete(url);
      };
      promise.then((page) => {
        if (!page) discard();
      }, discard);
      return promise;
    }

    function prioritizePageRead(url) {
      const index = pageJobs.findIndex((job) => job.url === url);
      if (index < 0) return;
      const [job] = pageJobs.splice(index, 1);
      job.urgent = true;
      job.needed = null;
      pageJobs.unshift(job);
      runPageQueue();
    }

    async function fetchDecidimPage({ url, urgent }) {
      const response = await requestWithTimeout(
        url,
        {
          credentials: "same-origin",
          cache: "no-store",
          priority: "high",
          headers: { Accept: "text/html" },
        },
        8000
      );
      if (!response.ok) throw new Error("HTTP " + response.status);
      if (!/^text\/html\b/i.test(response.headers.get("content-type") || "")) {
        throw new Error("Unexpected Decidim content type");
      }

      const requested = new URL(url, location.href);
      const destination = sameOriginURL(response.url);
      if (!destination || !sameDecidimPath(destination.pathname, requested.pathname)) {
        throw new Error("Unexpected Decidim response route");
      }
      return parseHTML(await response.text());
    }

    function runPageQueue() {
      while (pageJobs.length) {
        const job = pageJobs[0];
        if (activePageJobs >= maxParallelPageReads || (!job.urgent && nativeAjaxCount > 0)) return;
        pageJobs.shift();
        if (!job.urgent && job.needed && !job.needed()) {
          job.resolve(null);
          continue;
        }
        activePageJobs++;
        fetchDecidimPage(job)
          .then(job.resolve, job.reject)
          .finally(() => {
            activePageJobs--;
            runPageQueue();
          });
      }
    }
    function readFollowLink(e) {
      if (!e) return null;
      const t = e.getAttribute("href");
      return "A" === e.tagName && t && "#" !== t
        ? {
            login: false,
            active: "delete" === (e.getAttribute("data-method") || "").toLowerCase(),
            href: t,
          }
        : {
            login: true,
            active: false,
            href: null,
          };
    }
    function readProposalFollowControl(e, t) {
      return readFollowLink(e.getElementById(`follow_proposal_${t}`));
    }
    function readLikeControl(doc, id) {
      const wrapper = doc.getElementById(`resource-${id}-like-button`);
      if (!wrapper) return null;
      const form = wrapper.querySelector("form");
      const control =
        form?.querySelector("button, input[type=submit]") || wrapper.querySelector("a[href]");
      const target = form?.getAttribute("action") || control?.getAttribute("href");
      if (!target || target === "#" || control?.hasAttribute("data-dialog-open")) {
        return { login: true, active: false, href: null };
      }
      const method = (
        form?.querySelector('input[name="_method"]')?.value ||
        control?.getAttribute("data-method") ||
        (form ? "post" : "")
      ).toLowerCase();
      if (method !== "post" && method !== "delete") return null;
      const hiddenResource = form?.querySelector('input[name="resource_id"]')?.value;
      if (!hiddenResource || method !== "post") {
        return { login: false, active: method === "delete", href: target };
      }
      const url = sameOriginURL(target);
      if (!url) return null;
      const existing = url.searchParams.get("resource_id");
      if (existing && existing !== hiddenResource) return null;
      if (!url.searchParams.has("resource_id")) url.searchParams.set("resource_id", hiddenResource);
      return { login: false, active: false, href: url.href };
    }
    let cardVisibilityObserver = null;

    function loadCardsFromDetail(cards) {
      for (const card of cards) refreshCardCommitment(card, !card.hasDescription);
    }

    function refreshCardCommitment(card, needsDescription = false) {
      if (card.busy || card.unavailable || !card.card.isConnected) return;
      if (session.logged) {
        if (card.counts.follows === 0) {
          if (!card.known || card.following || card.recheck) {
            setCardCommitment(card, false, false, true);
          }
        } else if (card.inferredFromCount) {
          card.known = false;
          card.inferredFromCount = false;
          renderCardButton(card);
        }
      }
      if (
        enhancedCards.size > maxEagerCards &&
        cardVisibilityObserver &&
        !card.nearViewport &&
        !showMyCommitments
      )
        return;
      if (needsDescription || (session.logged && (!card.known || card.recheck))) {
        loadOwnCommitmentFromDetail(card);
      }
    }

    function loadOwnCommitmentFromDetail(e, t = false) {
      if (!session.logged && e.hasDescription) return;
      if (e.detailPromise) {
        if (t) {
          prioritizePageRead(e.url);
        }
        return;
      }
      if (e.known && !e.recheck && e.hasDescription) return;
      const n = Date.now();
      e.detailPromise = (async () => {
        for (let o = 0; o < 2; o++)
          try {
            const a = await readDecidimPage(e.url, {
              fresh: o > 0,
              urgent: t,
              needed: () => stillNeedsDetail(e),
            });
            if (!a) return;
            const r = a.querySelector(".editor-content .rich-text-display");
            if (
              (r &&
                !e.description.textContent &&
                renderCardDescription(e, extractProposalText(r.innerHTML)),
              session.logged && !e.busy && e.actedAt <= n && (!e.known || e.recheck))
            ) {
              const t = readLikeControl(a, e.id);
              if (t) {
                setCardCommitment(e, t.active, t.login);
              } else {
                markCardUnavailable(e);
              }
            }
            scheduleFilterRender();
            return;
          } catch (t) {
            console.warn("Taupa proposal:", e.id, t);
            if (0 === o) {
              await delay(1500);
            }
          }
      })().finally(() => {
        e.detailPromise = null;
      });
    }
    function stillNeedsDetail(e) {
      return e.card.isConnected
        ? !e.known || e.recheck || !e.hasDescription
        : visibleCardStates().some(
            (t) => t.id === e.id && (!t.known || t.recheck || !t.hasDescription)
          );
    }
    // Ruta local segura para redirect_url: un solo "/" inicial, sin "//" ni "\".
    function safeLocalPath(value, fallback = "/") {
      const url = typeof value === "string" ? sameOriginURL(value) : null;
      if (!url) return fallback;
      const path = url.pathname + url.search;
      return /^\/(?![\/\\])/.test(path) ? path : fallback;
    }
    function decidimPath(url) {
      return withoutLocalePrefix(url.pathname);
    }
    function proposalGlobalIdMatches(value, proposalId) {
      if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) return false;
      try {
        const gid = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
        return (
          /^gid:\/\/[^/?#]+\/Decidim::Proposals::Proposal\/\d+$/.test(gid) &&
          gid.endsWith("/" + proposalId)
        );
      } catch (_) {
        return false;
      }
    }
    function commitmentWriteTarget(value, method, base, operation, proposalId) {
      const target = sameOriginURL(value, base);
      if (!target || target.hash || !["POST", "DELETE"].includes(method)) return null;
      const path = decidimPath(target).replace(/\/$/, "");
      if (operation === "like") {
        const match = path.match(/^\/likes\/([A-Za-z0-9_-]+)$/);
        const gid = method === "POST" ? target.searchParams.get("resource_id") : match?.[1];
        if (
          method === "POST"
            ? path !== "/likes" || target.searchParams.getAll("resource_id").length !== 1
            : !match || target.searchParams.has("resource_id")
        )
          return null;
        if (!proposalGlobalIdMatches(gid, proposalId)) return null;
        for (const name of target.searchParams.keys()) {
          if (!["resource_id", "authenticity_token", "locale"].includes(name)) return null;
        }
      } else if (operation === "follow") {
        const gid = target.searchParams.getAll("follow[followable_gid]");
        if (path !== "/follow" || gid.length !== 1 || !/^[A-Za-z0-9_+\/=-]+$/.test(gid[0]))
          return null;
        for (const name of target.searchParams.keys()) {
          if (
            ![
              "follow[followable_gid]",
              "follow[button_classes]",
              "authenticity_token",
              "locale",
            ].includes(name)
          )
            return null;
        }
      } else return null;
      target.searchParams.delete("authenticity_token");
      return target;
    }
    async function sendDecidimWrite(url, method, base, operation, proposalId) {
      const target = commitmentWriteTarget(url, method, base, operation, proposalId);
      if (!target) throw new Error("Unexpected Decidim write target");
      const token = csrfToken();
      if (!token) throw new Error("CSRF token unavailable");
      const response = await requestWithTimeout(
        target.href,
        {
          method,
          credentials: "same-origin",
          redirect: "error",
          cache: "no-store",
          headers: {
            Accept: "text/javascript",
            "X-Requested-With": "XMLHttpRequest",
            "X-CSRF-Token": token,
          },
        },
        8000
      );
      if (!response.ok) throw new Error("HTTP " + response.status);
      if (response.redirected || /text\/html/i.test(response.headers.get("content-type") || "")) {
        throw new Error("Unexpected authentication or HTML response");
      }
    }
    let activeConsentDialog = null;
    function notificationSettingsURL() {
      return localizedURL(activeLocalePrefix() + "/notifications_settings");
    }
    function notificationForm(doc) {
      return (
        [...doc.querySelectorAll("form")].find((form) => {
          const url = sameOriginURL(form.getAttribute("action"), notificationSettingsURL());
          return (
            url &&
            decidimPath(url) === "/notifications_settings" &&
            form.querySelector('input[name="newsletter_notifications"]')
          );
        }) || null
      );
    }
    function enableNewsletter(account) {
      return (async () => {
        const e = notificationSettingsURL(),
          t = await readDecidimPage(e, {
            fresh: true,
            urgent: true,
          }),
          n = t && notificationForm(t),
          o = n?.querySelector('input[name="newsletter_notifications"]');
        if (!n || !o) throw new Error("Newsletter setting unavailable");
        requireSameAccount(account, t);
        if (o.hasAttribute("checked")) return false;
        const a = new URLSearchParams();
        for (const e of n.querySelectorAll("input, select, textarea")) {
          const t = (e.getAttribute("type") || "").toLowerCase();
          if (
            e.name &&
            !e.disabled &&
            "newsletter_notifications" !== e.name &&
            "submit" !== t &&
            "button" !== t &&
            "file" !== t &&
            (("checkbox" !== t && "radio" !== t) || e.hasAttribute("checked"))
          )
            if ("SELECT" !== e.tagName)
              a.append(
                e.name,
                "TEXTAREA" === e.tagName ? e.textContent : e.getAttribute("value") ?? "on"
              );
            else {
              const t = e.querySelector("option[selected]") || e.querySelector("option");
              if (t) {
                a.append(e.name, t.getAttribute("value") ?? t.textContent);
              }
            }
        }
        a.append("newsletter_notifications", "on");
        const endpoint = sameOriginURL(n.getAttribute("action"), e);
        if (
          !endpoint ||
          decidimPath(endpoint) !== "/notifications_settings" ||
          endpoint.hash ||
          [...endpoint.searchParams.keys()].some((name) => name !== "locale")
        ) {
          throw new Error("Unexpected settings destination");
        }
        const token = csrfToken();
        if (!token || a.get("_method")?.toLowerCase() !== "put") {
          throw new Error("Unexpected settings form");
        }
        a.delete("authenticity_token");
        const response = await requestWithTimeout(
          endpoint.href,
          {
            method: "POST",
            credentials: "same-origin",
            redirect: "manual",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Accept: "text/html",
              "X-CSRF-Token": token,
            },
            body: a,
          },
          8e3
        );
        if (!response.ok && response.type !== "opaqueredirect") {
          throw new Error("HTTP " + response.status);
        }
        const updated = response.ok
          ? parseHTML(await response.text())
          : await readDecidimPage(e, {
              fresh: true,
              urgent: true,
            });
        requireSameAccount(account, updated);
        if (
          !notificationForm(updated)
            ?.querySelector('input[name="newsletter_notifications"]')
            ?.hasAttribute("checked")
        )
          throw new Error("Newsletter not confirmed");
        pageCache.delete(e);
        return true;
      })()
        .then((enabled) => {
          if (enabled) showToast(message("commitDone") + " " + message("newsletterDone"));
        })
        .catch((error) => {
          console.warn("Taupa newsletter:", error);
          showToast(message("newsletterError"));
        });
    }
    function installDetailStyles() {
      preventEnhancedSnapshot();
    }
    let toastTimer = null;
    function showToast(e) {
      if (!e || disposed) return;
      installDetailStyles();
      let t = document.querySelector(".taupa-toast");
      if (!t) {
        t = document.createElement("div");
        t.className = "taupa-toast";
        t.setAttribute("role", "status");
        t.setAttribute("aria-live", "polite");
        t.append(createIcon("check-line"), document.createElement("span"));
        document.body.append(t);
      }
      t.querySelector("span").textContent = e;
      requestAnimationFrame(() => t.classList.add("is-visible"));
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => t.classList.remove("is-visible"), 3500);
    }
    function animateCounter(e) {
      if (e) {
        e.classList.remove("taupa-bump");
        // Force layout so a second change can restart the animation.
        void e.offsetWidth;
        e.classList.add("taupa-bump");
        e.addEventListener("animationend", () => e.classList.remove("taupa-bump"), {
          once: true,
        });
      }
    }
    const consentPoints = [
      ["consentBody", "mail-line"],
      ["consentPublic", "user-line"],
      ["consentSpace", "notification-3-line"],
      ["consentNewsletter", "mail-add-line"],
      ["consentWithdraw", "arrow-go-back-line"],
    ];

    function consentLink(href, text) {
      const link = document.createElement("a");
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = text;
      return link;
    }

    function confirmCommitment(proposalTitle, signInRequired = false) {
      if (activeConsentDialog || disposed) return Promise.resolve(false);
      if (typeof HTMLDialogElement !== "function") {
        const lines = [proposalTitle, ...consentPoints.map(([key]) => message(key))];
        if (signInRequired) lines.push(message("consentLogin"));
        return Promise.resolve(window.confirm(lines.filter(Boolean).join("\n\n")));
      }

      installDetailStyles();
      const previousFocus = document.activeElement;
      const dialog = document.createElement("dialog");
      dialog.className = "taupa-consent";
      dialog.setAttribute("aria-labelledby", "taupa-consent-title");
      dialog.setAttribute("aria-describedby", "taupa-consent-body");
      const content = document.createElement("div");
      content.className = "taupa-consent__inner";

      const header = document.createElement("div");
      header.className = "taupa-consent__head";
      const badge = document.createElement("span");
      badge.className = "taupa-consent__badge";
      badge.append(createIcon("hand-heart-line"));
      const title = document.createElement("h2");
      title.id = "taupa-consent-title";
      title.className = "taupa-consent__title";
      title.textContent = message("consentTitle");
      header.append(badge, title);
      content.append(header);
      if (proposalTitle) {
        const subject = document.createElement("p");
        subject.className = "taupa-consent__proposal";
        subject.textContent = proposalTitle;
        content.append(subject);
      }

      const body = document.createElement("div");
      body.id = "taupa-consent-body";
      const intro = document.createElement("p");
      intro.className = "taupa-consent__intro";
      intro.textContent = message("consentIntro");
      const points = document.createElement("ul");
      points.className = "taupa-consent__points";
      for (const [key, icon] of consentPoints) {
        const text = message(key);
        if (!text) continue;
        const item = document.createElement("li");
        item.append(createIcon(icon));
        if (key === "consentWithdraw") {
          const link = consentLink(localizedURL(activeLocalePrefix() + "/account"), text);
          link.className = "taupa-consent__account-link";
          item.append(link);
        } else {
          item.append(document.createTextNode(text));
        }
        points.append(item);
      }
      body.append(intro, points);
      if (signInRequired) {
        const hint = document.createElement("p");
        hint.className = "taupa-consent__next";
        hint.append(
          createIcon("login-circle-line"),
          document.createTextNode(message("consentLogin"))
        );
        body.append(hint);
      }
      content.append(body);

      const legal = document.createElement("p");
      legal.className = "taupa-consent__legal";
      legal.append(
        consentLink(
          localizedURL(activeLocalePrefix() + privacyPolicyPath),
          message("consentPrivacy")
        ),
        document.createTextNode(" · "),
        consentLink(
          localizedURL(activeLocalePrefix() + termsOfServicePath),
          message("consentTerms")
        )
      );
      content.append(legal);

      const actions = document.createElement("div");
      actions.className = "taupa-consent__actions";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "button button__sm button__transparent-secondary taupa-consent-cancel";
      cancel.textContent = message("consentCancel");
      const accept = document.createElement("button");
      accept.type = "button";
      accept.className = "button button__sm button__primary taupa-consent-accept";
      accept.textContent = message("consentAccept");
      actions.append(cancel, accept);
      content.append(actions);
      dialog.append(content);

      activeConsentDialog = new Promise((resolve) => {
        let settled = false;
        const finish = (confirmed) => {
          if (settled) return;
          settled = true;
          if (dialog.open) dialog.close();
          dialog.remove();
          activeConsentDialog = null;
          if (previousFocus?.isConnected) previousFocus.focus?.();
          resolve(confirmed);
        };
        accept.addEventListener("click", () => finish(true));
        cancel.addEventListener("click", () => finish(false));
        dialog.addEventListener("close", () => finish(false), { once: true });
        dialog.addEventListener("cancel", (event) => {
          event.preventDefault();
          finish(false);
        });
        dialog.addEventListener("click", (event) => {
          if (event.target !== dialog) return;
          const { left, right, top, bottom } = dialog.getBoundingClientRect();
          const { clientX, clientY } = event;
          if (clientX < left || clientX > right || clientY < top || clientY > bottom) finish(false);
        });
      });
      document.body.append(dialog);
      dialog.showModal();
      accept.focus();
      return activeConsentDialog;
    }

    async function writeAndConfirmCommitment(id, url, active, initialDoc, account) {
      requireSameAccount(account, initialDoc);
      const like = readLikeControl(initialDoc, id);
      if (!like || like.login) throw new Error("Like unavailable");
      let mutationError = null;
      if (like.active !== active) {
        try {
          await sendDecidimWrite(like.href, active ? "POST" : "DELETE", url, "like", id);
        } catch (error) {
          mutationError = error;
        }
      }
      let confirmedDoc;
      try {
        confirmedDoc = await readDecidimPage(url, { fresh: true, urgent: true });
        requireSameAccount(account, confirmedDoc);
      } catch (error) {
        throw mutationError || error;
      }
      const actual = readLikeControl(confirmedDoc, id);
      if (!actual || actual.login || actual.active !== active) {
        throw mutationError || new Error("Commitment not confirmed");
      }
      const value = confirmedDoc
        .getElementById(`resource-${id}-like-block`)
        ?.querySelector("[data-likes-count]")
        ?.textContent.trim();
      const count = value && /^\d+$/.test(value) ? Number(value) : null;
      return {
        doc: confirmedDoc,
        count,
      };
    }
    async function finishCommitmentFollowups(id, url, active, doc, account) {
      requireSameAccount(account, doc);
      const [proposalFollow, spaceFollow] = await Promise.all([
        setConfirmedFollow(url, active, doc, account, (page) =>
          readProposalFollowControl(page, id)
        ).then(
          () => true,
          (error) => {
            console.warn("Taupa follow:", error);
            return false;
          }
        ),
        active ? ensureSpaceFollow(account) : true,
        active ? enableNewsletter(account) : null,
      ]);
      return {
        partialFollow: !proposalFollow || !spaceFollow,
      };
    }
    async function setConfirmedFollow(url, active, doc, account, readControl) {
      let lastError;
      for (let attempt = 0; attempt <= 2; attempt++) {
        requireSameAccount(account, doc);
        const control = readControl(doc);
        if (!control || control.login) throw new Error("Follow control unavailable");
        if (control.active === active) return;
        if (attempt === 2) break;
        try {
          await sendDecidimWrite(control.href, active ? "POST" : "DELETE", url, "follow");
        } catch (error) {
          lastError = error;
        }
        doc = await readDecidimPage(url, {
          fresh: true,
          urgent: true,
        });
      }
      throw lastError || new Error("Follow not confirmed");
    }

    // Earlier intents did not include the fixed bulletin notice.
    const pendingAcquisitionKey = "taupa:pending-acquisition:v2";
    function rememberAcquisition(url, account) {
      if (!account) return false;
      try {
        sessionStorage.setItem(
          pendingAcquisitionKey,
          JSON.stringify({
            path: new URL(url).pathname,
            expires: Date.now() + 120_000,
            account,
          })
        );
        return true;
      } catch (_) {
        return false;
      }
    }
    function clearAcquisition(savedValue) {
      try {
        if (sessionStorage.getItem(pendingAcquisitionKey) === savedValue) {
          sessionStorage.removeItem(pendingAcquisitionKey);
        }
      } catch (_) {}
    }

    function clearAcquisitionForCurrentPage() {
      try {
        const savedValue = sessionStorage.getItem(pendingAcquisitionKey);
        const pending = JSON.parse(savedValue || "null");
        if (pending && sameDecidimPath(pending.path, location.pathname)) {
          clearAcquisition(savedValue);
        }
      } catch (_) {}
    }

    function actionError(key, error) {
      return /^HTTP [45]\d\d$/.test(error?.message)
        ? `${message(key)} (${error.message})`
        : message(key);
    }

    async function resumeAcquisition(proposal) {
      let pending;
      let savedValue;
      try {
        savedValue = sessionStorage.getItem(pendingAcquisitionKey);
        pending = JSON.parse(savedValue || "null");
        if (!pending) return;
        const expired = !(pending.expires > Date.now());
        const matchesProposal = sameDecidimPath(pending.path, location.pathname);
        const accountMatches = pending.account && pending.account === accountKey();
        if (expired || (matchesProposal && !accountMatches)) clearAcquisition(savedValue);
        if (expired || !matchesProposal || !accountMatches) return;
      } catch (_) {
        return;
      }
      const url = localizedURL(location.pathname);
      const { id } = proposal;
      let confirmed = false;
      detailState.busy = true;
      detailState.pendingAcquisition = true;
      renderProposalDetail(id);
      try {
        const initialDoc = await readDecidimPage(url, {
          fresh: true,
          urgent: true,
        });
        requireSameAccount(pending.account, initialDoc);
        const state = readLikeControl(initialDoc, id);
        if (!state || state.login) throw new Error("Like unavailable");
        const doc = state.active
          ? initialDoc
          : (await writeAndConfirmCommitment(id, url, true, initialDoc, pending.account)).doc;
        confirmed = true;
        clearAcquisition(savedValue);
        updateDetailCommitment(proposal, doc, url);
        detailState.pendingAcquisition = false;
        renderProposalDetail(id);
        showToast(message("commitDone"));
        if (state.active) {
          await enableNewsletter(pending.account);
        } else {
          const followups = await finishCommitmentFollowups(id, url, true, doc, pending.account);
          if (followups.partialFollow) showTimedStatus(detailState, message("partialFollow"));
        }
      } catch (error) {
        if (!disposed) {
          console.warn("Taupa action:", error);
          if (
            /^HTTP [45]\d\d$|^Like unavailable$|^Decidim account could not be confirmed$|^Unexpected Decidim write target$/.test(
              error?.message
            )
          ) {
            clearAcquisition(savedValue);
          }
          showTimedStatus(
            detailState,
            actionError(confirmed ? "partialFollow" : "commitError", error)
          );
        }
      } finally {
        detailState.busy = false;
        detailState.pendingAcquisition = false;
        if (!disposed) renderProposalDetail(id);
      }
    }
    async function changeCardCommitment(card) {
      if (card.busy || card.unavailable || activeConsentDialog) return;
      if (!session.logged) {
        if (await confirmCommitment(card.title, true)) {
          requestSignIn(session.component, card.id);
        }
        return;
      }
      const account = accountKey();
      // An unknown state is presented as an acquisition. An early click can
      // never withdraw a commitment that the participant has not yet seen.
      const acquire = !(card.known && card.following);
      if (acquire) {
        if (!(await confirmCommitment(card.title))) return;
        if (card.busy || card.unavailable || disposed) return;
      }
      const { button } = card;
      card.busy = true;
      showTimedStatus(card, "");
      button.setAttribute("aria-busy", "true");
      renderCardButton(card);
      const previousCount = card.counts.follows;
      let previousActive = null;
      try {
        if (acquire && rememberAcquisition(card.url, account)) {
          location.assign(card.url);
          return;
        }

        // Complete the action here if the browser blocks same-tab storage.
        const initial = await readDecidimPage(card.url, {
          fresh: true,
          urgent: true,
        });
        const current = readLikeControl(initial, card.id);
        if (!current) {
          markCardUnavailable(card);
          throw new Error("Like button unavailable");
        }
        if (current.login) {
          const follow = readProposalFollowControl(initial, card.id);
          if (!follow || follow.login) requestSignIn(session.component, card.id);
          else location.assign(card.url);
          return;
        }
        requireSameAccount(account, initial);
        if (current.active === acquire) {
          setCardCommitment(card, current.active);
          if (acquire && !disposed) {
            await enableNewsletter(account);
            if (!disposed) location.assign(card.url);
          }
          return;
        }
        previousActive = current.active;
        card.following = acquire;
        card.known = true;
        renderCardButton(card);
        if (Number.isInteger(previousCount)) {
          renderCardCounter(card, "follows", Math.max(0, previousCount + (acquire ? 1 : -1)));
        }
        const result = await writeAndConfirmCommitment(
          card.id,
          card.url,
          acquire,
          initial,
          account
        );
        previousActive = null;
        card.actedAt = Date.now();
        setCardCommitment(card, acquire);
        if (result.count !== null) renderCardCounter(card, "follows", result.count);
        updateProposalCache(card.id, {
          f: card.counts.follows,
        });
        const change =
          Number.isInteger(previousCount) && result.count !== null
            ? result.count - previousCount
            : acquire
            ? 1
            : -1;
        if (allCountsLoaded) {
          proposalCounts.set(card.id, card.counts.follows);
        } else {
          const cached = proposalCache();
          if (cached.total) {
            cached.total.n = Math.max(0, cached.total.n + change);
            scheduleCacheWrite();
          }
        }
        renderCommitmentTotal();
        animateCounter(card.counters.follows);
        animateCounter(document.querySelector("#proposals .taupa-switch__count"));
        showToast(message(acquire ? "commitDone" : "withdrawDone"));
        const followups = await finishCommitmentFollowups(
          card.id,
          card.url,
          acquire,
          result.doc,
          account
        );
        if (followups.partialFollow) {
          showTimedStatus(card, message(acquire ? "partialFollow" : "partialWithdraw"));
        }
        if (acquire && !disposed) location.assign(card.url);
      } catch (error) {
        console.warn("Taupa action:", error);
        if (previousActive !== null) {
          setCardCommitment(card, previousActive);
          if (Number.isInteger(previousCount)) renderCardCounter(card, "follows", previousCount);
          card.recheck = true;
          card.cacheTime = 0;
          card.dataRequested = false;
          scheduleCardDataLoad();
        }
        showTimedStatus(card, actionError(acquire ? "commitError" : "withdrawError", error));
      } finally {
        card.busy = false;
        button.removeAttribute("aria-busy");
        renderCardButton(card);
        scheduleFilterRender();
      }
    }
    function showTimedStatus(owner, text) {
      const status = owner.status;
      if (!status) return;
      clearTimeout(owner.statusTimer);
      status.textContent = text;
      status.classList.toggle("is-visible", Boolean(text));
      owner.statusTimer = text ? setTimeout(() => showTimedStatus(owner, ""), 6000) : null;
    }
    let spaceFollowQueue = Promise.resolve();
    function ensureSpaceFollow(account) {
      if (!account || !session.logged) return Promise.resolve(false);
      const index = location.pathname.indexOf("/f/");
      const url = index > 0 ? localizedURL(location.pathname.slice(0, index)) : null;
      if (!url) return Promise.resolve(false);
      // Space follows are serialized within this page; each uses server state.
      spaceFollowQueue = spaceFollowQueue.then(async () => {
        try {
          const doc = await readDecidimPage(url, {
            fresh: true,
            urgent: true,
          });
          await setConfirmedFollow(url, true, doc, account, (page) =>
            readFollowLink(page.querySelector(spaceFollowSelector))
          );
          return true;
        } catch (error) {
          console.warn("Taupa space:", error);
          return false;
        }
      });
      return spaceFollowQueue;
    }
    function rememberPendingCommitment(component, id, url) {
      try {
        sessionStorage.setItem(
          pendingKey,
          JSON.stringify({
            component,
            id,
            url,
            t: Date.now(),
          })
        );
      } catch (_) {}
    }
    function pendingCommitment() {
      try {
        const pending = JSON.parse(sessionStorage.getItem(pendingKey) || "null");
        if (!pending) return null;
        const age = Date.now() - pending.t;
        const url = sameOriginURL(pending.url);
        const match = url?.pathname.match(proposalDetailPath);
        if (
          Number.isFinite(age) &&
          age >= 0 &&
          age < 1800000 &&
          match &&
          match[1] === pending.component &&
          match[2] === pending.id
        )
          return pending;
      } catch (_) {}
      clearPendingCommitment();
      return null;
    }
    function clearPendingCommitment() {
      try {
        sessionStorage.removeItem(pendingKey);
      } catch (_) {}
    }
    function commitmentReturnPath(e = null, t = null) {
      const n = supportedLocale(),
        o = new URL(
          activeLocalePrefix() + (t || unprefixedPath() + location.search),
          location.origin
        );
      if (n) {
        o.searchParams.set("locale", n);
      }
      o.searchParams.delete(commitmentReturnParam);
      if (e) {
        o.searchParams.set(commitmentReturnParam, e);
      }
      return safeLocalPath(o.pathname + o.search);
    }
    function requestSignIn(
      e,
      t,
      n = ((e, t) => {
        const n = unprefixedPath(),
          o = n.indexOf("/f/");
        return `${o >= 0 ? n.slice(0, o) : ""}/f/${e}/proposals/${t}`;
      })(e, t)
    ) {
      const a = commitmentReturnPath(t, n);
      rememberPendingCommitment(e, t, a);
      openLoginDialog(a);
    }
    function addSameOriginQuery(e, t) {
      try {
        const n = new URL(e || location.href, location.href);
        if (n.origin !== location.origin) return e;
        for (const [e, o] of Object.entries(t)) n.searchParams.set(e, o);
        return n.pathname + n.search + n.hash;
      } catch (t) {
        return e;
      }
    }
    function openLoginDialog(e = null) {
      if (e) e = safeLocalPath(e);
      const t = document.getElementById("loginModal");
      if (t && e) {
        ((e, t) => {
          const n = supportedLocale();
          e.querySelectorAll("form").forEach((e) => {
            let o = e.querySelector('input[name="redirect_url"][data-taupa]');
            if (!o) {
              o = document.createElement("input");
              o.type = "hidden";
              o.name = "redirect_url";
              o.dataset.taupa = "";
              e.prepend(o);
            }
            o.value = t;
            if (n) {
              e.setAttribute(
                "action",
                addSameOriginQuery(e.getAttribute("action"), {
                  locale: n,
                })
              );
            }
          });
          e.querySelectorAll("a[href]").forEach((e) => {
            const o = e.getAttribute("href");
            if (!(!o || o.startsWith("#") || o.startsWith("javascript:"))) {
              e.setAttribute(
                "href",
                addSameOriginQuery(o, {
                  redirect_url: t,
                  ...(n
                    ? {
                        locale: n,
                      }
                    : {}),
                })
              );
            }
          });
        })(t, e);
      }
      const n = window.Decidim?.currentDialogs?.loginModal;
      if (t && "function" == typeof n?.open) return n.open();
      const o = document.querySelector('[data-dialog-open="loginModal"]');
      if (t && o) return o.click();
      const a = new URL(activeLocalePrefix() + "/users/sign_in", location.origin);
      a.searchParams.set("redirect_url", e || commitmentReturnPath());
      a.searchParams.set("locale", supportedLocale());
      location.assign(a.href);
    }
    const nonReturnPaths =
      /^\/(users|authorizations|account|tos|pages|admin|system|conversations|notifications|profiles)(\/|$)/;
    function resumePendingCommitment() {
      const pending = pendingCommitment();
      if (!pending || nonReturnPaths.test(unprefixedPath())) return false;
      refreshSession();
      if (!session.logged) return false;
      const target = new URL(pending.url, location.origin);
      if (sameDecidimPath(target.pathname, location.pathname)) {
        clearPendingCommitment();
        document.querySelector(".taupa-detail-commit")?.focus();
        return false;
      }
      location.replace(target.href);
      return true;
    }
    function isMyCommitment(e) {
      return e.known && !e.login && true === e.following;
    }
    function scheduleFilterRender() {
      if (!filtersRenderScheduled) {
        filtersRenderScheduled = true;
        requestAnimationFrame(() => {
          filtersRenderScheduled = false;
          renderFilters();
          if (hasLocalFilters()) {
            applyLocalFilters();
          }
        });
      }
    }
    function renderFilters() {
      let e = 0,
        t = 0,
        n = 0;
      for (const o of visibleCardStates()) {
        e++;
        if (!o.known || o.login) {
          n++;
        } else {
          if (isMyCommitment(o)) {
            t++;
          }
        }
      }
      const o = session.logged && e > 0 && 0 === n,
        a = message("mineSection");
      document.querySelectorAll(".taupa-my-commitments-option").forEach((e) => {
        e.checked = showMyCommitments;
      });
      document.querySelectorAll(".taupa-my-commitments-label").forEach((e) => {
        if (e.textContent !== a) {
          e.textContent = a;
        }
      });
      document.querySelectorAll(".taupa-switch__count").forEach((e) => {
        const n = String(t);
        if (e.textContent !== n) {
          e.textContent = n;
        }
        e.hidden = !o;
      });
      renderDeadlineChips();
    }
    let allPagesState = null;
    function paginationEnd(doc, baseUrl) {
      let maximum = 1;
      for (const anchor of doc.querySelectorAll("a[href]")) {
        let url;
        try {
          url = new URL(anchor.getAttribute("href"), baseUrl);
        } catch (_) {
          continue;
        }
        if (
          url.origin !== location.origin ||
          url.pathname.replace(/\/$/, "") !== location.pathname.replace(/\/$/, "")
        )
          continue;
        const page = url.searchParams.get("page");
        if (/^\d+$/.test(page || "")) maximum = Math.max(maximum, Number(page));
      }
      return maximum;
    }
    async function loadAllProposalPages() {
      const root = document.getElementById("proposals");
      const container = proposalCardsContainer();
      if (!root || !container) return;
      if (
        allPagesState?.root === root &&
        allPagesState.container === container &&
        allPagesState.rows.every((row) => row.isConnected)
      ) {
        if (allPagesState.complete) return;
        if (allPagesState.promise) return allPagesState.promise;
      }
      const state = {
        root,
        container,
        rows: [...container.children],
        complete: false,
        promise: null,
      };
      allPagesState = state;
      const sourceUrl = new URL(location.href);
      sourceUrl.searchParams.delete("taupa-commit");
      const pageNow = Number(sourceUrl.searchParams.get("page") || 1);
      const limit = maxPaginationPages;
      state.promise = (async () => {
        let last = Math.max(pageNow, paginationEnd(document, sourceUrl));
        if (last > limit) throw new Error("Pagination limit exceeded");
        const pages = new Map([
          [pageNow, [...container.querySelectorAll(":scope > .card__proposals-item")]],
        ]);
        for (let page = 1; page <= last; page++) {
          if (disposed || !root.isConnected || proposalCardsContainer() !== container)
            throw new Error("Proposal list changed");
          if (page === pageNow) continue;
          const url = new URL(sourceUrl);
          url.searchParams.set("page", String(page));
          const doc = await readDecidimPage(url.href, {
            fresh: true,
            urgent: true,
          });
          if (!doc?.getElementById("proposals")) throw new Error("Proposal page unavailable");
          last = Math.max(last, paginationEnd(doc, url));
          if (last > limit) throw new Error("Pagination limit exceeded");
          const cards = [...doc.querySelectorAll(proposalCardSelector)].map((card) =>
            card.closest(".card__proposals-item")
          );
          if (!cards.length) throw new Error("Unexpected empty proposal page");
          pages.set(
            page,
            cards.map((card) => importDecidimFragment(card, url.href))
          );
        }
        if (disposed || !root.isConnected || proposalCardsContainer() !== container)
          throw new Error("Proposal list changed");
        const seen = new Set();
        const rows = [];
        for (const [, cards] of [...pages.entries()].sort(([a], [b]) => a - b)) {
          for (const card of cards) {
            const id = card.querySelector('[id^="proposals__proposal_"]')?.id;
            if (!id || seen.has(id)) throw new Error("Duplicate proposal or unexpected pagination");
            seen.add(id);
            rows.push(card);
          }
        }
        for (const row of rows) container.append(row);
        state.rows = rows;
        state.complete = true;
        // These links would return to a partial page while local filters are active.
        for (const nav of document.querySelectorAll(
          '#proposals .pagination, #proposals [class*="pagination"], nav.pagination'
        )) {
          nav.hidden = true;
          nav.style.setProperty("display", "none", "important");
        }
        renderProposalList();
      })().finally(() => {
        state.promise = null;
      });
      return state.promise;
    }
    let deadlineFilter = "all";
    function hasLocalFilters() {
      return showMyCommitments || "all" !== deadlineFilter;
    }
    function matchesDeadline(e) {
      return "all" === deadlineFilter || e.wrapper.dataset.taupaDeadline === deadlineFilter;
    }
    function renderDeadlineChips() {
      const states = visibleCardStates();
      const byDeadline = {
        short: [],
        long: [],
      };
      states.forEach((state) => byDeadline[state.wrapper.dataset.taupaDeadline]?.push(state));
      let container = document.querySelector("#proposals .taupa-deadline-chips");
      if (!byDeadline.short.length && !byDeadline.long.length) {
        container?.remove();
        return;
      }
      if (!container) {
        const toolbar = findOrCreateListToolbar();
        if (!toolbar) return;
        container = document.createElement("div");
        container.className = "taupa-deadline-chips";
        container.setAttribute("role", "group");
        const chips = container;
        chips.addEventListener("click", async (event) => {
          const chip = event.target.closest(".taupa-chip");
          if (!chip || chips.getAttribute("aria-busy") === "true") return;
          chips.setAttribute("aria-busy", "true");
          try {
            if (chip.dataset.filter !== "all") await loadAllProposalPages();
            deadlineFilter = chip.dataset.filter;
            showFilterStatus("");
            renderDeadlineChips();
            applyLocalFilters();
          } catch (error) {
            console.warn("Taupa pagination:", error);
            showFilterStatus(message("paginationError"));
          } finally {
            chips.removeAttribute("aria-busy");
          }
        });
        toolbar.after(chips);
      }
      const labelFor = (deadline) =>
        byDeadline[deadline][0]?.wrapper.querySelector(".taupa-deadline-label")?.textContent ||
        deadlineLabels["short" === deadline ? "shortTerm" : "longTerm"][0];
      const entries = [["all", message("deadlineAll"), states.length, null]].concat(
        ["short", "long"]
          .filter((deadline) => byDeadline[deadline].length)
          .map((deadline) => [deadline, labelFor(deadline), byDeadline[deadline].length, deadline])
      );
      if (!entries.some(([filter]) => filter === deadlineFilter)) {
        deadlineFilter = "all";
      }
      const signature = deadlineFilter + "|" + entries.map((entry) => entry.slice(0, 3).join(":")).join("|");
      if (container.dataset.signature !== signature) {
        container.dataset.signature = signature;
        container.replaceChildren(
          ...entries.map(([filter, text, count, deadline]) => {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "taupa-chip";
            chip.dataset.filter = filter;
            chip.setAttribute("aria-pressed", String(filter === deadlineFilter));
            if (deadline) {
              const dot = document.createElement("span");
              dot.className = "taupa-chip__dot";
              dot.dataset.deadline = deadline;
              chip.append(dot);
            }
            const small = document.createElement("small");
            small.textContent = count;
            chip.append(document.createTextNode(text + " "), small);
            return chip;
          })
        );
      }
    }
    function toggleDisplay(e, t) {
      e.style.display = t ? "" : "none";
    }
    function showFilterStatus(e = "") {
      document.querySelectorAll(".taupa-my-commitments-status").forEach((t) => {
        t.textContent = e;
        t.classList.toggle("is-visible", !!e);
      });
    }
    function setCardVisibility(e, t) {
      e.hidden = !t;
      if (t) {
        e.style.removeProperty("display");
      } else {
        e.style.setProperty("display", "none", "important");
      }
    }
    function applyLocalFilters() {
      let e = 0,
        t = 0;
      for (const n of visibleCardStates()) {
        const o = matchesDeadline(n),
          a = o && showMyCommitments && (!n.known || n.login),
          r = o && (!showMyCommitments || a || isMyCommitment(n));
        n.wrapper.classList.toggle("spinner-container", a);
        if (a) {
          n.wrapper.setAttribute("aria-busy", "true");
        } else {
          n.wrapper.removeAttribute("aria-busy");
        }
        setCardVisibility(n.wrapper, r);
        if (a) {
          t++;
        } else {
          if (r) {
            e++;
          }
        }
      }
      const hasPendingCards = t > 0;
      document.querySelectorAll(".taupa-my-commitments-filter").forEach((filter) => {
        filter.setAttribute("aria-busy", String(hasPendingCards));
      });
      const o = document.querySelector(".taupa-my-commitments-empty");
      if (o) {
        toggleDisplay(o, hasLocalFilters() && 0 === t && 0 === e);
      }
    }
    function getOrderIndex(e) {
      const t = e.dataset.order;
      let n = supportedOrderKeys.indexOf(t);
      if (n < 0) {
        const t = e.textContent.trim(),
          o = orderLabelPatterns.find(([e]) => e.test(t));
        if (o) {
          n = supportedOrderKeys.indexOf(o[1]);
        }
      }
      return n;
    }
    function proposalCardsContainer() {
      return (
        document.querySelector(proposalCardSelector)?.closest(".card__proposals-item")
          ?.parentElement || null
      );
    }
    function findOrCreateListToolbar() {
      let e = document.querySelector("#proposals .taupa-proposals-toolbar");
      if (e) return e;
      const t = document.querySelector("#proposals h2");
      return t && proposalCardsContainer()
        ? ((e = document.createElement("div")),
          (e.className =
            "flex flex-wrap items-center justify-between gap-4 mt-6 taupa-proposals-toolbar"),
          t.parentElement.after(e),
          e)
        : null;
    }
    function proposalDetailRoute() {
      const e = location.pathname.match(proposalDetailPath);
      return e
        ? {
            component: e[1],
            id: e[2],
          }
        : null;
    }
    function localizeRemoteAttribute(element, attribute) {
      const value = element.getAttribute(attribute);
      if (!value || value === "#") return;
      const url = sameOriginURL(value);
      if (!url) return;
      const language = supportedLocale();
      if (pathLocale(url.pathname)) {
        url.pathname = "/" + language + withoutLocalePrefix(url.pathname);
        url.searchParams.delete("locale");
      } else {
        url.searchParams.set("locale", language);
      }
      setAttributeIfChanged(element, attribute, url.pathname + url.search + url.hash);
    }
    function setAttributeIfChanged(e, t, n) {
      if (e.getAttribute(t) !== n) {
        e.setAttribute(t, n);
      }
    }
    const detailState = {
      busy: false,
      committed: null,
      pendingAcquisition: false,
      status: null,
      statusTimer: null,
    };
    function renderProposalDetail(e) {
      document.querySelectorAll('a[data-remote="true"]:not([data-taupa-locale])').forEach((e) => {
        localizeRemoteAttribute(e, "href");
        e.setAttribute("data-taupa-locale", "");
      });
      document
        .querySelectorAll('form[data-remote="true"]:not([data-taupa-locale])')
        .forEach((e) => {
          localizeRemoteAttribute(e, "action");
          e.setAttribute("data-taupa-locale", "");
        });
      ((e) => {
        const t = document.getElementById(`liker-list-${e}`);
        if ("individual" === componentType) {
          if (t) hideElement(t);
          return;
        }
        const n = document.getElementById(`likesModal-${e}`);
        if (!t || !n || t.querySelector(".taupa-likers")) return;
        const o = n.querySelectorAll(".list-item__author p.author");
        if (!o.length) return;
        const a = document.createElement("div");
        a.className = "taupa-likers";
        const r = message("committersTitle");
        if (r) {
          const e = document.createElement("h3");
          e.className = "h5 text-gray-2";
          e.textContent = r;
          a.append(e);
        }
        const i = document.createElement("ul");
        i.className = "flex flex-wrap gap-4 mt-3";
        o.forEach((e) => {
          const t = importDecidimFragment(e, location.href);
          if (!t) return;
          [t, ...t.querySelectorAll("[id]")].forEach((e) => e.removeAttribute("id"));
          const n = document.createElement("li");
          n.append(t);
          i.append(n);
        });
        a.append(i);
        const s = t.querySelector(".likes-list__container");
        if (s) hideElement(s);
        t.prepend(a);
      })(e);
      const t = document.querySelector(".layout-main__buttons");
      if (!t) return;
      const n = document.getElementById(`resource-${e}-like-button`);
      if (n) hideElement(n);
      const o = document.getElementById(`follow_proposal_${e}`),
        a = o && (o.closest("li") || o.closest("form") || o);
      if (a) hideElement(a);
      t.querySelectorAll(".add-comment-mobile, a[href='#add-comment-anchor']").forEach(hideElement);
      let r = t.querySelector(".taupa-detail-commit");
      if (!r) {
        r = document.createElement("button");
        r.type = "button";
        r.addEventListener("click", () => changeDetailCommitment(proposalDetailRoute()));
        const n = document.getElementById(`resource-${e}-like-block`);
        if (n?.parentElement === t) {
          n.after(r);
        } else {
          t.prepend(r);
        }
        detailState.status = document.createElement("small");
        detailState.status.className = "form-error taupa-detail-status";
        detailState.status.setAttribute("role", "status");
        t.after(detailState.status);
      }
      if (r.hidden !== !n) {
        r.hidden = !n;
      }
      const i = n ? readLikeControl(document, e) : null,
        s =
          detailState.busy && null !== detailState.committed ? detailState.committed : !!i?.active;
      const buttonClasses =
        "button button__sm " +
        (s ? "button__primary" : "button__secondary") +
        " taupa-detail-commit";
      if (r.className !== buttonClasses) r.className = buttonClasses;
      r.disabled = detailState.busy;
      setAttributeIfChanged(r, "aria-pressed", String(s));
      setAttributeIfChanged(r, "title", message(s ? "withdraw" : "commit"));
      if (detailState.busy) r.setAttribute("aria-busy", "true");
      else r.removeAttribute("aria-busy");
      const u = message(
        detailState.pendingAcquisition ? "commitPending" : s ? "committed" : "commit"
      );
      const d = r.querySelector("span");
      if (!d || d.textContent !== u || !!r.querySelector("svg") !== s) {
        const e = document.createElement("span");
        e.className = "taupa-detail-commit-label";
        e.textContent = u;
        r.replaceChildren(e);
        if (s) {
          r.append(createIcon("check-line"));
        }
      }
    }
    function updateDetailCommitment({ component, id }, doc, url) {
      for (const nodeId of [
        `resource-${id}-like-button`,
        `liker-list-${id}`,
        `likesModal-${id}`,
        `follow_proposal_${id}`,
      ]) {
        const current = document.getElementById(nodeId);
        const next = doc.getElementById(nodeId);
        if (!current || !next) continue;
        // Aquí sí hacen falta formularios y botones: readLikeControl los lee.
        const replacement = importDecidimFragment(next, url, { interactive: true });
        if (replacement) current.replaceWith(replacement);
      }
      const like = readLikeControl(doc, id);
      if (like && !like.login) saveMineToSession(component, id, like.active, Date.now());
      for (const locale of supportedLocales) {
        const key = `${proposalCachePrefix}${component}:${locale}`;
        try {
          const cached = JSON.parse(localStorage.getItem(key) || "null");
          if (!cached?.items?.[id]) continue;
          cached.items[id].stale = 1;
          localStorage.setItem(key, JSON.stringify(cached));
        } catch (_) {}
      }
    }
    async function changeDetailCommitment(e) {
      if (!e || detailState.busy || activeConsentDialog || disposed) return;
      const o = () =>
        document.querySelector(".layout-main__heading h1, main h1")?.textContent.trim() || "";
      if (!session.logged) {
        if (!(await confirmCommitment(o(), true))) return;
        requestSignIn(e.component, e.id);
        return;
      }
      const account = accountKey();
      const r = readLikeControl(document, e.id);
      if (!r) return;
      if (r.login) {
        const trigger = document.querySelector(
          `#resource-${e.id}-like-button button[data-dialog-open]`
        );
        if (trigger?.type === "button") trigger.click();
        return;
      }
      const i = !r.active;
      if (i && !(await confirmCommitment(o()))) return;
      if (detailState.busy) return;
      clearAcquisitionForCurrentPage();
      detailState.busy = true;
      detailState.committed = i;
      showTimedStatus(detailState, "");
      renderProposalDetail(e.id);
      const c = localizedURL(location.pathname);
      try {
        const fresh = await readDecidimPage(c, {
          fresh: true,
          urgent: true,
        });
        requireSameAccount(account, fresh);
        const serverState = readLikeControl(fresh, e.id);
        if (!serverState || serverState.login || serverState.active !== r.active) {
          throw new Error("Commitment changed since the page loaded");
        }
        const { doc: t } = await writeAndConfirmCommitment(e.id, c, i, fresh, account);
        updateDetailCommitment(e, t, c);
        showToast(message(i ? "commitDone" : "withdrawDone"));
        const followups = await finishCommitmentFollowups(e.id, c, i, t, account);
        if (followups.partialFollow)
          showTimedStatus(detailState, message(i ? "partialFollow" : "partialWithdraw"));
      } catch (e) {
        console.warn("Taupa action:", e);
        showTimedStatus(detailState, actionError(i ? "commitError" : "withdrawError", e));
      } finally {
        detailState.busy = false;
        detailState.committed = null;
        renderProposalDetail(e.id);
      }
    }
    function renderDetailDeadline() {
      const title = document.querySelector(".layout-main__heading h1, main h1");
      if (!title || document.querySelector(".taupa-detail-deadline")) return;
      for (const tag of document.querySelectorAll("[data-tags] li")) {
        const text = (tag.querySelector('span[aria-hidden="true"]') || tag).textContent
          .trim()
          .replace(/\s+/g, " ");
        const label = normalizeLabel(text);
        if (deadlineLabels.hidden.includes(label)) {
          tag.remove();
          continue;
        }
        const deadline = deadlineLabels.shortTerm.includes(label)
          ? "short"
          : deadlineLabels.longTerm.includes(label)
          ? "long"
          : null;
        if (!deadline) continue;
        const link = tag.querySelector("a");
        const badge = document.createElement(link ? "a" : "span");
        if (link) {
          badge.href = link.href;
          if (link.title) badge.title = link.title;
        }
        badge.className = "label taupa-detail-deadline";
        badge.dataset.deadline = deadline;
        badge.textContent = text;
        const row = document.createElement("div");
        row.append(badge);
        title.after(row);
        tag.remove();
      }
    }

    function enhanceProposalDetail(proposal) {
      installDetailStyles();
      refreshSession();
      session.component = proposal.component;
      renderDetailDeadline();
      renderProposalDetail(proposal.id);
      if (session.logged) {
        resumeAcquisition(proposal);
        resumePendingCommitment();
      }

      let scheduled = false;
      const observer = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
          scheduled = false;
          renderProposalDetail(proposal.id);
        });
      });
      observer.observe(document.getElementById("content") || document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-method"],
      });
    }
    function observeProposalList() {
      const e = document.getElementById("content") || document.body;
      if (listObserver && e !== listObserverTarget) {
        listObserver.disconnect();
        listObserver.observe(e, {
          childList: true,
          subtree: true,
        });
        listObserverTarget = e;
      }
    }
    function normalizeListLocaleLinks() {
      if (activeLocalePrefix()) return;
      const prefix = "/" + supportedLocale();
      const normalizeAttribute = (element, attribute) => {
        const url = sameOriginURL(element.getAttribute(attribute));
        if (!url || (url.pathname !== prefix && !url.pathname.startsWith(prefix + "/"))) return;
        url.pathname = url.pathname.slice(prefix.length) || "/";
        if (!url.searchParams.has("locale")) url.searchParams.set("locale", prefix.slice(1));
        element.setAttribute(attribute, url.pathname + url.search + url.hash);
      };
      document
        .querySelectorAll(
          `#proposals a[href^="${prefix}/"], #dropdown-menu-order a[href^="${prefix}/"]`
        )
        .forEach((link) => normalizeAttribute(link, "href"));
      document
        .querySelectorAll(`form[data-remote="true"][action^="${prefix}/"]`)
        .forEach((form) => normalizeAttribute(form, "action"));
    }
    function hideNativeProposalFilters() {
      // El selector lista/tarjetas deja de ser útil: la vista es siempre en tarjetas.
      document.querySelectorAll('a[href*="view_mode="]').forEach(hideElement);
      document.querySelectorAll("#dropdown-menu-order a[data-order]").forEach((e) => {
        if (getOrderIndex(e) < 0) {
          e.remove();
        }
      });
      for (const e of hiddenFilterIds) {
        const t =
            document.getElementById(`trigger-menu-${e}`) ||
            document.getElementById(`panel-dropdown-menu-${e}`),
          n = t?.closest(".filter-container");
        if (n) hideElement(n);
      }
      document.querySelectorAll('[id^="trigger-menu-taxonomy-"]').forEach((e) => {
        const n = normalizeLabel(e.querySelector("span")?.textContent || e.textContent);
        if (
          !deadlineTaxonomyNames.has(n) &&
          !commitmentTaxonomyNames.some((name) => n.startsWith(name))
        )
          return;
        const o = e.closest(".filter-container");
        if (o) hideElement(o);
      });
    }
    function mountMyCommitmentsFilter() {
      if (document.querySelector(".taupa-my-commitments-filter")) return;
      const e = findOrCreateListToolbar();
      if (!e) return;
      const t = "taupa-my-commitments-toggle",
        n = document.createElement("div");
      n.className = "taupa-my-commitments-filter";
      const o = document.createElement("label");
      o.htmlFor = t;
      o.className = "taupa-switch";
      const a = document.createElement("input");
      a.type = "checkbox";
      a.id = t;
      a.className = "taupa-my-commitments-option";
      a.setAttribute("role", "switch");
      a.addEventListener("change", () => {
        (async (enabled) => {
          if (enabled && !session.logged) {
            showMyCommitments = false;
            renderFilters();
            openLoginDialog(commitmentReturnPath());
            return;
          }
          if (enabled) {
            try {
              a.disabled = true;
              await loadAllProposalPages();
            } catch (error) {
              console.warn("Taupa pagination:", error);
              showMyCommitments = false;
              renderFilters();
              applyLocalFilters();
              showFilterStatus(message("paginationError"));
              return;
            } finally {
              a.disabled = false;
            }
          }
          showMyCommitments = enabled;
          showFilterStatus("");
          renderFilters();
          applyLocalFilters();
          if (!enabled || visibleCardStates().every((card) => card.known)) return;
          const unknown = await (async () => {
            for (let attempt = 0; attempt < 3; attempt++) {
              scheduleCardDataLoad(true);
              await Promise.allSettled(
                visibleCardStates()
                  .map((card) => card.dataPromise)
                  .filter(Boolean)
              );
              const pending = visibleCardStates().filter((card) => !card.known);
              if (!pending.length) break;
              pending.forEach((card) => loadOwnCommitmentFromDetail(card, true));
              await Promise.allSettled(pending.map((card) => card.detailPromise).filter(Boolean));
            }
            return visibleCardStates().filter((card) => !card.known).length;
          })();
          if (showMyCommitments) {
            showFilterStatus(unknown ? message("filterError") : "");
            applyLocalFilters();
            renderFilters();
          }
        })(a.checked).catch((error) => {
          console.warn("Taupa my commitments:", error);
          showMyCommitments = false;
          applyLocalFilters();
          renderFilters();
          showFilterStatus(message("filterError"));
        });
      });
      const r = document.createElement("span");
      r.className = "taupa-switch__track";
      r.setAttribute("aria-hidden", "true");
      const i = document.createElement("span");
      i.className = "taupa-my-commitments-label";
      const s = document.createElement("span");
      s.className = "taupa-switch__count";
      s.hidden = true;
      o.append(a, r, i, s);
      const c = document.createElement("small");
      c.className = "form-error taupa-my-commitments-status";
      c.setAttribute("role", "status");
      n.append(o, c);
      e.prepend(n);
    }
    function mountProposalOrder() {
      const e = document.getElementById("dropdown-menu-order"),
        t = document.getElementById("dropdown-trigger-order");
      if (!e || !t) return;
      const n = Array.from(e.querySelectorAll("a[data-order]"))
          .filter((e) => getOrderIndex(e) >= 0)
          .sort((e, t) => getOrderIndex(e) - getOrderIndex(t)),
        o = findOrCreateListToolbar();
      if (!n.length || !o) return;
      let a = document.getElementById("taupa-order-select");
      if (!a) {
        const e = document.createElement("div");
        e.className = "flex flex-wrap items-center gap-2 taupa-order-control";
        const t = document.createElement("label");
        t.htmlFor = "taupa-order-select";
        t.className = "text-sm text-gray-2";
        t.textContent = message("orderShort");
        t.title = proposalOrderLabel();
        a = document.createElement("select");
        a.id = "taupa-order-select";
        a.setAttribute("aria-label", proposalOrderLabel());
        a.addEventListener("change", () => {
          document
            .querySelector(`#dropdown-menu-order a[data-order="${CSS.escape(a.value)}"]`)
            ?.click();
        });
        e.append(t, a);
        o.append(e);
      }
      const r =
        session.locale +
        "|" +
        n.map((e) => e.dataset.order + ":" + e.getAttribute("aria-current")).join("|");
      if (a.dataset.signature !== r) {
        a.dataset.signature = r;
        const e = n.map((e) => {
          const t = document.createElement("option");
          t.value = e.dataset.order;
          t.textContent = message("orders")?.[e.dataset.order] || e.textContent.trim();
          t.selected = "true" === e.getAttribute("aria-current");
          return t;
        });
        if (!e.some((e) => e.selected)) {
          const t = document.createElement("option");
          t.value = "";
          t.disabled = true;
          t.selected = true;
          t.textContent = "—";
          e.unshift(t);
        }
        a.replaceChildren(...e);
      }
      hideElement(t);
      hideElement(e);
    }
    function mountEmptyFilterMessage() {
      if (document.querySelector(".taupa-my-commitments-empty")) return;
      const e = proposalCardsContainer();
      if (!e) return;
      const t = document.createElement("div");
      t.className = "flash flex-col taupa-my-commitments-empty";
      t.setAttribute("role", "status");
      const n = document.createElement("div");
      n.className = "flash__message";
      n.textContent = message("emptyFilters");
      t.append(n);
      toggleDisplay(t, false);
      e.before(t);
    }
    function decorateCardDeadline(element, wrapper) {
      const metadata = element.querySelectorAll(
        ".card__grid-text :is(.card__grid-metadata, .card__list-metadata)"
      );
      const counterSelector = "[data-likes-count],[data-comments-count],[data-follows-count]";
      const seen = new Set();
      let firstDeadline = null;
      let hasShortDeadline = false;
      let hasLongDeadline = false;
      for (const group of metadata) {
        for (const node of group.querySelectorAll("div, span, a")) {
          if (!node.isConnected || node.closest(counterSelector)) continue;
          const label = normalizeLabel(node.textContent);
          const hidden = deadlineLabels.hidden.includes(label);
          const short = deadlineLabels.shortTerm.includes(label);
          const long = deadlineLabels.longTerm.includes(label);
          if (!hidden && !short && !long) continue;
          let tag = node;
          while (
            tag.parentElement &&
            tag.parentElement !== group &&
            normalizeLabel(tag.parentElement.textContent) === label
          ) {
            tag = tag.parentElement;
          }
          if (seen.has(tag)) continue;
          seen.add(tag);
          if (hidden) {
            tag.remove();
            continue;
          }
          hasShortDeadline ||= short;
          hasLongDeadline ||= long;
          if (firstDeadline) tag.remove();
          else firstDeadline = tag;
        }
      }
      if (hasShortDeadline !== hasLongDeadline) {
        wrapper.dataset.taupaDeadline = hasShortDeadline ? "short" : "long";
      }
      for (const group of metadata) {
        for (const icon of group.querySelectorAll("svg use")) {
          if (!icon.closest(counterSelector) && !firstDeadline?.contains(icon)) {
            icon.setAttribute("href", getIconSprite() + "#ri-price-tag-3-line");
          }
        }
      }
      const heading = element.querySelector(".card__grid-text-title");
      if (firstDeadline && heading) {
        const label = document.createElement("span");
        label.className = "label taupa-deadline-label";
        label.textContent = firstDeadline.textContent.trim().replace(/\s+/g, " ");
        heading.append(label);
        firstDeadline.remove();
      }
    }

    function initializeCardCountersAndState(card, likes, comments) {
      if (comments) {
        const count = Number(comments.textContent.trim());
        card.counters.comments = createCounterContents(comments, "comments");
        renderCardCounter(card, "comments", count);
      }
      for (const node of card.card.querySelectorAll("[data-comments-count], [data-likes-count]")) {
        if (node !== comments && node !== likes) node.hidden = true;
      }

      const nativeCount = likes ? Number(likes.textContent.trim()) : null;
      likes?.remove();
      const cache = proposalCache();
      const saved = cache.items[card.id];
      const now = Date.now();
      const hasNativeCount = Number.isInteger(nativeCount);
      const hasCachedCount =
        Number.isInteger(saved?.f) && now - (saved.t || 0) <= counterCacheMaxAge;
      const hasDescription =
        typeof saved?.d === "string" && now - (saved.dt || 0) <= descriptionCacheMaxAge;
      const knowsMyCommitment =
        session.logged &&
        session.user &&
        cache.user === session.user &&
        typeof saved?.m === "boolean" &&
        now - (saved.mt || 0) <= descriptionCacheMaxAge;

      if (hasNativeCount) renderCardCounter(card, "follows", nativeCount);
      else if (hasCachedCount) renderCardCounter(card, "follows", saved.f);
      if (hasDescription) renderCardDescription(card, saved.d);

      if (
        (hasNativeCount || hasCachedCount) &&
        hasDescription &&
        !saved?.stale &&
        (!session.logged || knowsMyCommitment)
      ) {
        card.cacheTime = hasNativeCount ? now : saved.t;
      }
      if (!session.logged) {
        card.known = true;
        card.following = false;
        card.login = true;
      } else if (knowsMyCommitment) {
        card.known = true;
        card.following = saved.m;
        card.recheck = Boolean(saved.stale) || now - (saved.mt || 0) > counterCacheMaxAge;
      }
    }

    function enhanceProposalCard(element) {
      if (cardStateByElement.has(element)) return;
      const id = element.id.match(/proposal_(\d+)/)?.[1];
      const wrapper = element.closest(".card__proposals-item");
      const body = element.querySelector(".card__grid-text");
      if (!id || !wrapper || !body) return;

      for (const author of element.querySelectorAll('p.author[data-author="true"]'))
        author.remove();
      const image = element.querySelector(".card__grid-img");
      if (
        image?.querySelector(".card__proposal-placeholder-g") &&
        !image.querySelector("img:not(.card__proposal-placeholder-g)")
      )
        image.remove();
      wrapper.classList.add("taupa-proposal-card");
      decorateCardDeadline(element, wrapper);

      const heading = body.querySelector(".card__grid-text-title");
      const description = document.createElement("p");
      description.className = "taupa-proposal-description";
      description.hidden = true;
      heading?.after(description);
      const controls = document.createElement("div");
      controls.className = "card__proposals-votes taupa-proposal-actions";
      const buttonContainer = document.createElement("div");
      buttonContainer.className = "card__proposals-votes-container";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button button__sm button__secondary w-full taupa-proposal-button";
      buttonContainer.append(button);
      controls.append(buttonContainer);
      const status = document.createElement("small");
      status.className = "form-error taupa-proposal-status";
      status.setAttribute("role", "status");

      const likes = element.querySelector("[data-likes-count]");
      const comments = element.querySelector("[data-comments-count]");
      const card = {
        id,
        url: proposalURL(session.component, id),
        title: (heading?.querySelector("h3,h2") || heading)?.textContent.trim() || "",
        card: element,
        wrapper,
        description,
        status,
        button,
        metadata:
          (likes || comments)?.parentElement ||
          body.querySelector(".card__grid-metadata, .card__list-metadata"),
        counters: {},
        counts: {},
        known: false,
        following: null,
        login: false,
        busy: false,
        hovered: false,
        unavailable: false,
        recheck: false,
        hasDescription: false,
        labelKey: null,
        actedAt: 0,
        cacheTime: 0,
        dataRequested: false,
        dataPromise: null,
        detailPromise: null,
        nearViewport: false,
        inferredFromCount: false,
        statusTimer: null,
      };

      initializeCardCountersAndState(card, likes, comments);
      renderCardButton(card);
      button.addEventListener("click", () => changeCardCommitment(card));
      const setHovered = (hovered) => {
        if (card.hovered === hovered) return;
        card.hovered = hovered;
        if (card.following) renderCardButton(card);
      };
      button.addEventListener("mouseenter", () => setHovered(true));
      button.addEventListener("mouseleave", () => setHovered(false));
      button.addEventListener("focus", () => setHovered(true));
      button.addEventListener("blur", () => setHovered(false));
      wrapper.append(controls, status);
      cardStateByElement.set(element, card);
      enhancedCards.add(element);
      cardVisibilityObserver?.observe(element);
      if (card.counts.follows === 0) refreshCardCommitment(card);
    }
    // Vista en tarjetas: la personalización solo funciona con ella, así que se
    // fuerza aunque Decidim recuerde la vista en lista de la visita anterior.
    const gridRedirectKey = "taupa:grid-redirect:v1";
    function proposalViewIsList() {
      const root = document.getElementById("proposals");
      if (!root || root.querySelector(proposalCardSelector)) return false;
      return !!root.querySelector('[id^="proposals__proposal_"]');
    }
    function gridViewURL() {
      const target = [...document.querySelectorAll('a[href*="view_mode=grid"]')]
        .map((link) => sameOriginURL(link.getAttribute("href")))
        .find((url) => url && sameDecidimPath(url.pathname, location.pathname));
      const url = new URL(target || location.href);
      url.searchParams.set("view_mode", "grid");
      url.hash = "";
      return url;
    }
    function ensureGridView() {
      if (!proposalViewIsList()) return false;
      // Si ya pedimos la vista en tarjetas y no cambia, no insistir.
      if (new URLSearchParams(location.search).get("view_mode") === "grid") return false;
      try {
        const last = Number(sessionStorage.getItem(gridRedirectKey) || 0);
        if (Date.now() - last < 10000) return false;
        sessionStorage.setItem(gridRedirectKey, String(Date.now()));
        location.replace(gridViewURL().href);
        return true;
      } catch (_) {
        return false;
      }
    }
    function renderProposalList() {
      if (disposed) return;
      if (ensureGridView()) return;
      refreshSession();
      if (!(session.component && document.getElementById("proposals"))) {
        enhancedCards.clear();
        return;
      }
      observeProposalList();
      normalizeListLocaleLinks();
      document.querySelectorAll(proposalCardSelector).forEach(enhanceProposalCard);
      hideNativeProposalFilters();
      mountMyCommitmentsFilter();
      mountProposalOrder();
      renderCommitmentTotal();
      mountEmptyFilterMessage();
      renderFilters();
      scheduleCardDataLoad();
      if (session.logged) {
        resumePendingCommitment();
      }
      if (hasLocalFilters()) {
        applyLocalFilters();
      }
      listObserver?.takeRecords?.();
    }
    function scheduleListRender() {
      if (!listRenderScheduled) {
        listRenderScheduled = true;
        requestAnimationFrame(() => {
          listRenderScheduled = false;
          renderProposalList();
        });
      }
    }
    const observedListSelector =
      '#proposals, .card__proposals-item, .card__grid[id^="proposals__proposal_"]';
    function enhanceProposalList() {
      if (typeof window.IntersectionObserver === "function") {
        cardVisibilityObserver = new window.IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              const card = cardStateByElement.get(entry.target);
              if (!card) continue;
              card.nearViewport = entry.isIntersecting;
              if (card.nearViewport && card.dataRequested) {
                if (card.dataPromise) {
                  card.dataPromise.then(() => refreshCardCommitment(card, !card.hasDescription));
                } else {
                  refreshCardCommitment(card, !card.hasDescription);
                }
              }
            }
          },
          { rootMargin: "280px" }
        );
        observers.add(cardVisibilityObserver);
      }
      const finishNativeAjax = () => {
        nativeAjaxCount = Math.max(0, nativeAjaxCount - 1);
        if (!nativeAjaxCount) clearTimeout(nativeAjaxTimer);
        runPageQueue();
      };
      listen(document, "ajax:send", () => {
        nativeAjaxCount++;
        clearTimeout(nativeAjaxTimer);
        nativeAjaxTimer = setTimeout(() => {
          nativeAjaxCount = 0;
          runPageQueue();
        }, 15_000);
      });
      listen(document, "ajax:complete", finishNativeAjax);
      listen(document, "ajax:stopped", finishNativeAjax);
      listObserver = new MutationObserver((changes) => {
        for (const { addedNodes } of changes) {
          for (const node of addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;
            if (node.matches(observedListSelector) || node.querySelector(observedListSelector)) {
              scheduleListRender();
              return;
            }
          }
        }
      });
      listen(window, "pageshow", (event) => {
        if (!event.persisted) return;
        for (const card of visibleCardStates()) {
          card.cacheTime = 0;
          card.dataRequested = false;
          card.recheck = true;
        }
        proposalAliasQueriesFailed = false;
        totalScanFinished = false;
        pageCache.clear();
        scheduleListRender();
      });
      renderProposalList();
    }
    function mountWhenAvailable(selector, mount) {
      if (document.querySelector(selector)) {
        mount();
        return;
      }
      const observer = new MutationObserver(() => {
        if (!document.querySelector(selector)) return;
        observer.disconnect();
        mount();
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    }
    function cleanCommitmentReturnURL() {
      const url = new URL(location.href);
      if (!url.searchParams.has(commitmentReturnParam)) return;
      url.searchParams.delete(commitmentReturnParam);
      if (activeLocalePrefix()) url.searchParams.delete("locale");
      try {
        history.replaceState(history.state, "", url.pathname + url.search + url.hash);
      } catch (_) {}
    }
    const proposal = proposalDetailRoute();
    const component = proposal?.component || currentComponentId();
    componentType = detectedType && component ? detectedType : null;
    if (componentType) {
      cleanCommitmentReturnURL();
      markEnhanced(componentType, proposal ? "detail" : "list");
      if (proposal) {
        enhanceProposalDetail(proposal);
      } else {
        installListStyles();
        mountWhenAvailable("#proposals", enhanceProposalList);
      }
    } else if (pendingCommitment()) {
      resumePendingCommitment();
    }
  }
})();
