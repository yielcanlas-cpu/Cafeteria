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

/* ---------------------------------------------------------
   Proof photos: shrunk in the browser (max 1000 px, JPEG) so they stay small, then sent as text with the message
   --------------------------------------------------------- */
const MAX_PHOTOS = 3;
const proofInput = document.querySelector("#cProof");
const proofList = document.querySelector("#proofList");
let photos = [];                                      // data URLs

function shrink(file) {
  return new Promise(function (resolve, reject) {
    const img = new Image();
    img.onload = function () {
      const scale = Math.min(1, 1000 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";                         // PNGs with a see-through background
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL("image/jpeg", 0.75));
    };
    img.onerror = function () { reject(new Error(file.name + " is not a photo.")); };
    img.src = URL.createObjectURL(file);
  });
}

function drawPhotos() {
  proofList.innerHTML = "";
  photos.forEach(function (url, index) {
    const box = document.createElement("div");
    box.className = "proof-item";
    const pic = document.createElement("img");
    pic.src = url;
    pic.alt = "Proof photo " + (index + 1);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "\u00d7";
    remove.setAttribute("aria-label", "Remove photo " + (index + 1));
    remove.addEventListener("click", function () { photos.splice(index, 1); drawPhotos(); });
    box.append(pic, remove);
    proofList.append(box);
  });
  proofInput.disabled = photos.length >= MAX_PHOTOS;
}

proofInput.addEventListener("change", async function () {
  formMsg.textContent = "";
  try {
    for (const file of proofInput.files) {
      if (photos.length >= MAX_PHOTOS) { formMsg.textContent = "You can add up to " + MAX_PHOTOS + " photos."; break; }
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { formMsg.textContent = file.name + ": only JPG, PNG or WebP photos."; continue; }
      photos.push(await shrink(file));
    }
  } catch (err) {
    formMsg.textContent = err.message;
  }
  proofInput.value = "";
  drawPhotos();
});

contactForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  const button = contactForm.querySelector(".send");
  formMsg.textContent = "";
  button.disabled = true;

  try {
    const data = Object.fromEntries(new FormData(contactForm));
    delete data.proof;                               // the file box itself is not sent; the shrunk photos are
    data.images = photos;
    await api("contact", data);
    formMsg.textContent = "Thank you! Your message was sent.";
    contactForm.querySelector("#cSubject").value = "";
    contactForm.querySelector("#cMessage").value = "";
    photos = [];
    drawPhotos();
  } catch (err) {
    formMsg.textContent = err.message;
  } finally {
    button.disabled = false;
  }
});
