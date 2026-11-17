/* =========================================================
   profile.js  -  the profile page (profile.html)
   Needs common.js loaded first.
   Name, email and join date come from the database.
   Location, phone and bio are saved back to it.
   ========================================================= */

const bioBox = document.querySelector("#bio");
const locationEl = document.querySelector("#location");
const numberEl = document.querySelector("#number");

let savedProfile = null;       // what the database currently holds


/* ---------------------------------------------------------
   1. START: load the logged-in person's profile
   --------------------------------------------------------- */
(async function start() {
  let user = null;
  try { user = await getCurrentUser(); } catch (err) { user = null; }

  if (!user) {
    location.replace("login.html?next=profile.html");
    return;
  }

  document.querySelector("#backLink").href = homeFor(user);     // staff go back to their own page
  document.body.classList.remove("checking");

  try {
    const { profile } = await api("profile");
    savedProfile = profile;

    document.querySelector("#profileName").textContent = profile.name;
    document.querySelector("#email").textContent = profile.email;
    if (!profile.email.includes("@")) document.querySelector("#emailRow").hidden = true;   // signed up with a number
    locationEl.textContent = profile.location;
    numberEl.textContent = profile.phone;
    bioBox.textContent = profile.bio;

    // "2026-11-08 07:30:00" -> "Joined in November 2026"
    const joined = new Date(profile.created_at.replace(" ", "T"));
    document.querySelector("#joined").textContent = isNaN(joined)
      ? "Joined"
      : "Joined in " + joined.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  } catch (err) {
    showToast(err.message);
  }
})();

document.querySelector("#logoutBtn").addEventListener("click", logOut);   // logOut() is in common.js


/* ---------------------------------------------------------
   2. SAVING
   Sends location, phone and bio to the server. Returns true if it worked.
   --------------------------------------------------------- */
async function saveProfile() {
  const fields = {
    location: locationEl.textContent.trim(),
    phone: numberEl.textContent.trim(),
    bio: bioBox.textContent.trim()
  };

  try {
    const result = await api("update_profile", fields);
    savedProfile = Object.assign(savedProfile || {}, result);
    showToast("Saved.");
    return true;
  } catch (err) {
    showToast(err.message);                    // e.g. "Enter a valid phone number."
    return false;
  }
}


/* ---------------------------------------------------------
   3. THE "EDIT" BUTTONS
   First click: makes the text editable and the button says "Save".
   Second click: saves it to the database and locks the text again.
   --------------------------------------------------------- */
document.querySelectorAll(".edit-btn").forEach(function (button) {
  // data-target="number" in the HTML -> find the element with id="number"
  const target = document.querySelector("#" + button.dataset.target);

  async function toggle() {
    if (!target.isContentEditable) {           // start editing
      target.contentEditable = "true";
      target.classList.add("editing");
      target.focus();                          // put the cursor inside
      button.textContent = "Save";
      return;
    }

    button.disabled = true;
    const ok = await saveProfile();
    button.disabled = false;
    if (!ok) return;                           // stay in edit mode so nothing typed is lost

    target.contentEditable = "false";
    target.classList.remove("editing");
    button.textContent = "Edit";
  }

  button.addEventListener("click", toggle);

  // Enter = save (these are one-line fields)
  target.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (target.isContentEditable) toggle();
    }
  });
});


/* ---------------------------------------------------------
   4. THE BIO  (saved automatically when you click away from it)
   --------------------------------------------------------- */
bioBox.addEventListener("blur", function () {
  const text = bioBox.textContent.trim();
  if (savedProfile && text === savedProfile.bio) return;   // nothing changed
  saveProfile();
});
