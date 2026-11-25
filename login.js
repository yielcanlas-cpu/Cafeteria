/* =========================================================
   login.js  -  the login / create account page

   After a successful login each account goes to its own home:
     student  ->  index.html  (the main menu / dashboard)
     staff    ->  admin.html  (all orders)
   ========================================================= */

const tabLogin = document.querySelector("#tabLogin");
const tabSignup = document.querySelector("#tabSignup");
const loginForm = document.querySelector("#loginForm");
const signupForm = document.querySelector("#signupForm");
const authError = document.querySelector("#authError");
const verifyForm = document.querySelector("#verifyForm");
const tabsBox = document.querySelector(".tabs");


/* ---------------------------------------------------------
   1. WHERE TO GO AFTER LOGGING IN
   If a page sent you here (login.html?next=profile.html) we go back to it,
   but only if it looks like a plain page name. Anything else is ignored,
   so nobody can use this page to send you to another website.
   --------------------------------------------------------- */
function destinationFor(user) {
  if (user.role === "owner") return "owner.html";
  if (user.role === "admin") return "admin.html";

  const next = new URLSearchParams(location.search).get("next") || "";
  const looksSafe = /^[A-Za-z0-9_-]+\.html(#[A-Za-z0-9_-]+)?$/.test(next) && !next.startsWith("login.html") && !next.startsWith("admin.html") && !next.startsWith("owner.html");
  return looksSafe ? next : "index.html";
}


/* ---------------------------------------------------------
   2. TABS  (Log in / Create account)
   --------------------------------------------------------- */
function showTab(which) {
  const isLogin = which === "login";
  tabLogin.classList.toggle("active", isLogin);        // toggle(name, true/false) adds or removes
  tabSignup.classList.toggle("active", !isLogin);
  tabsBox.hidden = false;
  verifyForm.hidden = true;                            // leave the "enter your code" step
  loginForm.hidden = !isLogin;
  signupForm.hidden = isLogin;
  authError.textContent = "";                          // clear the old message
}

tabLogin.addEventListener("click", function () { showTab("login"); });
tabSignup.addEventListener("click", function () { showTab("signup"); });


/* ---------------------------------------------------------
   2b. THE EYE  (show / hide the password)
   Each eye button sits next to its password box.
   --------------------------------------------------------- */
document.querySelectorAll(".eye").forEach(function (eye) {
  const input = eye.parentElement.querySelector("input");   // the box next to this eye
  const picture = eye.querySelector("img");

  eye.addEventListener("click", function () {
    const showIt = input.type === "password";       // is the password hidden right now?
    input.type = showIt ? "text" : "password";      // switch between hidden and visible
    picture.src = showIt ? "img/icons/eye-off.svg" : "img/icons/eye.svg";
    eye.setAttribute("aria-label", showIt ? "Hide password" : "Show password");
  });
});

// "Forgot password?" has no reset by email yet, so tell the person what to do
document.querySelector("#forgotLink").addEventListener("click", function (event) {
  event.preventDefault();
  showToast("Forgot your password? Please ask the canteen staff to help you.");
});


/* ---------------------------------------------------------
   3. SUBMITTING THE FORMS
   --------------------------------------------------------- */
function handleForm(form, action) {
  form.addEventListener("submit", async function (event) {
    event.preventDefault();                            // stop the page from reloading
    authError.textContent = "";

    const button = form.querySelector("button[type=submit]");
    button.disabled = true;                            // no double clicks while we wait

    try {
      // FormData reads every input that has a name="..." in the form
      const data = Object.fromEntries(new FormData(form));
      const result = await api(action, data);
      if (result.needs_verification) {                 // student: the email must be verified first
        showVerify(result.email);
        button.disabled = false;
        return;
      }
      if (!result.user) throw new Error("Unexpected reply from the server. Please refresh the page (Ctrl + F5) and try again.");
      location.replace(destinationFor(result.user));   // go to the right home page
    } catch (err) {
      authError.textContent = err.message;
      button.disabled = false;
    }
  });
}

handleForm(loginForm, "login");
handleForm(signupForm, "register");


/* ---------------------------------------------------------
   3b. VERIFY EMAIL
   Students get a 6-digit code by email (every log in, and sign up).
   Staff and the main admin never see this step.
   --------------------------------------------------------- */
const verifyCode = document.querySelector("#verifyCode");
const resendBtn = document.querySelector("#resendBtn");
let verifyAddress = "";          // the email the code was sent to
let resendTimer = null;

function startResendCountdown(seconds) {
  clearInterval(resendTimer);
  let left = seconds;
  resendBtn.disabled = true;
  resendBtn.textContent = "Resend code (" + left + "s)";
  resendTimer = setInterval(function () {
    left -= 1;
    if (left <= 0) {
      clearInterval(resendTimer);
      resendBtn.disabled = false;
      resendBtn.textContent = "Resend code";
    } else {
      resendBtn.textContent = "Resend code (" + left + "s)";
    }
  }, 1000);
}

function showVerify(email) {
  verifyAddress = email;
  document.querySelector("#verifyEmail").textContent = email;
  tabsBox.hidden = true;
  loginForm.hidden = true;
  signupForm.hidden = true;
  verifyForm.hidden = false;
  authError.textContent = "";
  verifyCode.value = "";
  verifyCode.focus();
  startResendCountdown(60);
}

// only digits in the code box
verifyCode.addEventListener("input", function () {
  verifyCode.value = verifyCode.value.replace(/\D/g, "").slice(0, 6);
});

verifyForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  authError.textContent = "";
  const button = verifyForm.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const { user } = await api("verify_email", { email: verifyAddress, code: verifyCode.value });
    location.replace(destinationFor(user));
  } catch (err) {
    authError.textContent = err.message;
    button.disabled = false;
  }
});

resendBtn.addEventListener("click", async function () {
  authError.textContent = "";
  resendBtn.disabled = true;
  try {
    await api("resend_code", { email: verifyAddress });
    showToast("A new code was sent to " + verifyAddress);
    startResendCountdown(60);
  } catch (err) {
    authError.textContent = err.message;
    resendBtn.disabled = false;
  }
});

document.querySelector("#verifyBack").addEventListener("click", function () { showTab("login"); });


// login.html?tab=signup opens the Sign up tab straight away
if (new URLSearchParams(location.search).get("tab") === "signup") showTab("signup");


/* ---------------------------------------------------------
   4. ALREADY LOGGED IN?  Skip this page.
   If the server cannot be reached, show why instead of a blank form.
   --------------------------------------------------------- */
(async function init() {
  try {
    const user = await getCurrentUser();
    if (user) location.replace(destinationFor(user));
  } catch (err) {
    authError.textContent = err.message;
  }
})();
