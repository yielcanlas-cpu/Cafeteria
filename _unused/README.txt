Old files that are NOT part of the working site any more.
They were moved here (not deleted) so nothing is lost:

  staff.*              older copy of the staff page - admin.html replaced it
  owner.*, members.*   owner / manager pages. They need API actions (owner_*, manager_*) and
                       account roles (owner, manager) that api.php and the database do not have
  order.html, app.js, canteen.css, admin.php, mcc-canteen-auth.html
                       first version of the site, before login.html / index.html existed
  create-owner.php, reset-owner-password.php   use OWNER_* settings that config.php does not define
  profile.js           duplicate of profile-page.js
  update-*.sql         db.php now adds those columns by itself

You can delete this folder once you are sure you do not need them.
