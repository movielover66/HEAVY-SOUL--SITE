document.addEventListener('DOMContentLoaded',()=>{
 if(!window.firebase||!firebase.apps.length)return;
 firebase.auth().onAuthStateChanged(user=>{
  const name=document.querySelector('.profile-name'),email=document.querySelector('.profile-email'),avatar=document.querySelector('.profile-avatar');
  if(name)name.textContent=user?(user.displayName||'Heavy Souler'):'Guest';
  if(email)email.textContent=user?(user.email||user.phoneNumber||''):'Not logged in';
  if(avatar)avatar.textContent=user?(user.displayName||user.email||'HS').slice(0,2).toUpperCase():'HS';
  const logout=document.querySelector('.btn-logout'); if(logout)logout.onclick=()=>authLogOut();
 });
});
