/* eslint-disable */
// import AutoComplete from "src/decidim/autocomplete"; // COMENTADO: No compatible con Decidim 0.31

$(() => {
  const searchInput = document.getElementById("tc-autocomplete");

  // Si no encuentra el input, paramos para evitar errores
  if (!searchInput) {
    return;
  }

  const resultsElement = document.getElementById("add-translations-results");
  const template = resultsElement.querySelector("template");
  const form = searchInput.closest("form");

  // Protección extra por si el formulario no carga bien
  if (!form) return;

  const searchUrl = new URL(form.getAttribute("action"), window.location.origin);
  let currentSearch = "";
  let selectedTerms = [];

  // Prevent accidental submit on the autocomplete field
  form.addEventListener("submit", (ev) => ev.preventDefault());

  const dataSource = (query, callback) => {
    const baseParams = Object.fromEntries(searchUrl.searchParams.entries());
    const params = new URLSearchParams({ ...baseParams, term: query });
    fetch(`${searchUrl.pathname}?${params.toString()}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    }).then((response) => response.json()).then((data) => {
      callback(data);
    });
  };

  // Just to avoid the "no-new" ESLint issue, wrap this in a function
  const initiate = () => {
    // Si no hay dataset, salimos
    if (!searchInput.dataset.autocomplete) return null;

    const config = JSON.parse(searchInput.dataset.autocomplete);

    // COMENTADO: La clase AutoComplete ha sido eliminada en 0.31
    /*
    return new AutoComplete(searchInput, {
      name: searchInput.getAttribute("name"),
      placeholder: searchInput.getAttribute("placeholder"),
      searchPrompt: true,
      searchPromptText: config.searchPromptText,
      threshold: 3,
      dataMatchKeys: ["label"],
      modifyResult: (item, valueItem) => {
        const sanitizedSearch = currentSearch.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
        const re = new RegExp(`(${sanitizedSearch})`, "gi");
        const replacedText = item.textContent.replace(re, '<strong class="search-highlight">$1</strong>');
        item.innerHTML = replacedText;
        item.dataset.value = valueItem.value;
      },
      dataSource
    });
    */
    console.log("Term Customizer: Autocomplete deshabilitado temporalmente por incompatibilidad.");
    return null;
  };

  const ac = initiate();

  searchInput.addEventListener("keyup", () => {
    currentSearch = searchInput.value;
  });

  // Method for hiding the currently selected items
  const hideSelectedItems = () => {
    const resultsList = searchInput.nextSibling;
    // Protección: verificamos que exista resultsList
    if (resultsList && resultsList.querySelectorAll) {
      for (const resultItem of resultsList.querySelectorAll("li")) {
        if (selectedTerms.indexOf(resultItem.dataset.value) < 0) {
          resultItem.classList.remove("hide");
        } else {
          resultItem.classList.add("hide");
        }
      }
    }
  };

  // Currently not possible in Decidim to get notified when the list is
  // modified, so hack it with a MutationObserver.
  // Create an observer instance linked to the callback function
  const observer = new MutationObserver(() => {
    hideSelectedItems();
  });
  
  if (searchInput.nextSibling) {
    observer.observe(searchInput.nextSibling, { childList: true });
  }

  // Hide the already selected items when the input is opened
  // Handle the selection of an item
  searchInput.addEventListener("selection", (ev) => {
    const selection = ev.detail.selection;
    const selectedItem = selection.value;
    const newRow = template.content.cloneNode(true).querySelector("tr");
    
    // Fix posibles errores de replace si los valores son nulos
    const val = selectedItem.value || "";
    const label = selectedItem.label || "";

    newRow.innerHTML = newRow.innerHTML.replace(new RegExp("{{translation_key}}", "g"), val);
    newRow.innerHTML = newRow.innerHTML.replace(new RegExp("{{translation_term}}", "g"), label);

    const targetTable = resultsElement.querySelector("table tbody");
    if (targetTable) {
        targetTable.appendChild(newRow);
        resultsElement.classList.remove("hide");
    }

    // Add it to the selected elements and hide the selected item
    selectedTerms.push(selectedItem.value);
    hideSelectedItems();

    // Listen to the click event on the remove button
    const removeBtn = newRow.querySelector(".remove-translation-key");
    if (removeBtn) {
        removeBtn.addEventListener("click", (removeEv) => {
        removeEv.preventDefault();
        if (newRow.parentNode) newRow.parentNode.removeChild(newRow);
        selectedTerms = selectedTerms.filter((item) => item !== selectedItem.value);
        hideSelectedItems();

        if (targetTable && targetTable.querySelectorAll("tr").length < 1) {
            resultsElement.classList.add("hide");
        }
        });
    }

    setTimeout(() => {
      // COMENTADO: ac.autocomplete.open();
    }, 0)
  });

  document.addEventListener("click", (event) => {
    if (searchInput.nextSibling && !searchInput.nextSibling.contains(event.target)) {
      setTimeout(() => {
        // COMENTADO: ac.autocomplete.close();
      }, 0)
    }
  });
});
