/* =========================================================
   contact.js  -  the "Stay Connected" page (contact.html)
   Sends the message to api.php. Staff read it (and can answer) on the staff page.
   A logged-in student also sees the answer under Messages on the main menu.
   ========================================================= */

setupPublicHeader();                                  // logo + Back button (common.js)

const contactForm = document.querySelector("#contactForm");
const formMsg = document.querySelector("#formMsg");

// If somebody is logged in, fill in their name and email for them
getCurrentUser().then(function (user) {
  if (!user) return;
  document.querySelector("#cName").value = user.name;
  if (user.email.includes("@")) document.querySelector("#cEmail").value = user.email;
}).catch(function () { /* not logged in or server off: leave the boxes empty */ });

contactForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  const button = contactForm.querySelector(".send");
  formMsg.textContent = "";
  button.disabled = true;

  try {
    await api("contact", Object.fromEntries(new FormData(contactForm)));
    formMsg.textContent = "Thank you! Your message was sent.";
    contactForm.querySelector("#cSubject").value = "";
    contactForm.querySelector("#cMessage").value = "";
  } catch (err) {
    formMsg.textContent = err.message;
  } finally {
    button.disabled = false;
  }
});
