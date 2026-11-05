/* Hentity shared runtime: icons, brand assets, header, tab bar, account menu, theme, toasts, demo session. */
(function () {
  'use strict';

  // ---------- Icons (exported from Figma Components page, Lucide-style 20px grid) ----------
  const P = {
    comment: ['M6.58333 16.6667C8.17382 17.4825 10.0034 17.7035 11.7424 17.2898C13.4814 16.8761 15.0155 15.8549 16.0681 14.4101C17.1208 12.9654 17.6228 11.1923 17.4838 9.41013C17.3448 7.62801 16.5738 5.95414 15.3098 4.69016C14.0459 3.42618 12.372 2.65521 10.5899 2.51618C8.80774 2.37715 7.03456 2.87921 5.58985 3.93187C4.14514 4.98454 3.12391 6.51859 2.71019 8.25759C2.29646 9.9966 2.51745 11.8262 3.33333 13.4167L1.66667 18.3333L6.58333 16.6667Z'],
    search: ['M9.16667 15C12.3883 15 15 12.3883 15 9.16667C15 5.94501 12.3883 3.33333 9.16667 3.33333C5.94501 3.33333 3.33334 5.94501 3.33334 9.16667C3.33334 12.3883 5.94501 15 9.16667 15Z', 'M16.6667 16.6667L13.75 13.75'],
    bell: ['M8.55833 17.5C8.70484 17.7526 8.91513 17.9622 9.16815 18.1079C9.42116 18.2537 9.70802 18.3304 10 18.3304C10.292 18.3304 10.5788 18.2537 10.8319 18.1079C11.0849 17.9622 11.2952 17.7526 11.4417 17.5', 'M2.71667 12.775C2.60879 12.8945 2.53784 13.0428 2.51242 13.2018C2.487 13.3608 2.50818 13.5237 2.57342 13.6709C2.63865 13.8182 2.74513 13.9433 2.88 14.0313C3.01486 14.1193 3.17232 14.1663 3.33334 14.1667H16.6667C16.8277 14.1663 16.9851 14.1193 17.12 14.0313C17.2549 13.9433 17.3614 13.8182 17.4266 13.6709C17.4918 13.5237 17.513 13.3608 17.4876 13.2018C17.4622 13.0428 17.3912 12.8945 17.2833 12.775C16.175 11.6333 15 10.4167 15 6.66667C15 5.34058 14.4732 4.06881 13.5355 3.13113C12.5979 2.19345 11.3261 1.66667 10 1.66667C8.67392 1.66667 7.40215 2.19345 6.46447 3.13113C5.52679 4.06881 5 5.34058 5 6.66667C5 10.4167 3.825 11.6333 2.71667 12.775Z'],
    plus: ['M4.16667 10H15.8333', 'M10 4.16667V15.8333'],
    calendar: ['M6.66667 1.66667V5', 'M13.3333 1.66667V5', 'M15.8333 3.33333H4.16667C3.24619 3.33333 2.5 4.07953 2.5 5V16.6667C2.5 17.5871 3.24619 18.3333 4.16667 18.3333H15.8333C16.7538 18.3333 17.5 17.5871 17.5 16.6667V5C17.5 4.07953 16.7538 3.33333 15.8333 3.33333Z', 'M2.5 8.33333H17.5'],
    'arrow-up-right': ['M5.83334 5.83333H14.1667V14.1667', 'M5.83334 14.1667L14.1667 5.83333'],
    share: ['M3.33334 10V16.6667C3.33334 17.1087 3.50894 17.5326 3.8215 17.8452C4.13406 18.1577 4.55798 18.3333 5.00001 18.3333H15C15.442 18.3333 15.866 18.1577 16.1785 17.8452C16.4911 17.5326 16.6667 17.1087 16.6667 16.6667V10', 'M13.3333 5L9.99999 1.66667L6.66666 5', 'M10 1.66667V12.5'],
    bookmark: ['M15.8333 17.5L9.99999 14.1667L4.16666 17.5V4.16667C4.16666 3.72464 4.34225 3.30072 4.65481 2.98816C4.96737 2.67559 5.3913 2.5 5.83332 2.5H14.1667C14.6087 2.5 15.0326 2.67559 15.3452 2.98816C15.6577 3.30072 15.8333 3.72464 15.8333 4.16667V17.5Z'],
    home: ['M12.5 17.5V10.8333C12.5 10.6123 12.4122 10.4004 12.2559 10.2441C12.0996 10.0878 11.8877 10 11.6667 10H8.33333C8.11232 10 7.90036 10.0878 7.74408 10.2441C7.5878 10.4004 7.5 10.6123 7.5 10.8333V17.5', 'M2.5 8.33333C2.4998 8.09054 2.55265 7.85064 2.65485 7.63041C2.75705 7.41018 2.90613 7.21493 3.09167 7.05833L8.925 2.05833C9.2257 1.80453 9.60651 1.6653 10 1.6653C10.3935 1.6653 10.7743 1.80453 11.075 2.05833L16.9083 7.05833C17.0939 7.21493 17.243 7.41018 17.3451 7.63041C17.4473 7.85064 17.5002 8.09054 17.5 8.33333V15.8333C17.5 16.2754 17.3244 16.6993 17.0118 17.0118C16.6993 17.3244 16.2754 17.5 15.8333 17.5H4.16667C3.72464 17.5 3.30072 17.3244 2.98816 17.0118C2.6756 16.6993 2.5 16.2754 2.5 15.8333V8.33333Z'],
    compass: ['M9.99999 18.3333C14.6024 18.3333 18.3333 14.6024 18.3333 10C18.3333 5.39763 14.6024 1.66667 9.99999 1.66667C5.39762 1.66667 1.66666 5.39763 1.66666 10C1.66666 14.6024 5.39762 18.3333 9.99999 18.3333Z', 'M13.5333 6.46667L11.7667 11.7667L6.46667 13.5333L8.23334 8.23333L13.5333 6.46667Z'],
    user: ['M10 10.8333C12.3012 10.8333 14.1667 8.96785 14.1667 6.66667C14.1667 4.36548 12.3012 2.5 10 2.5C7.69882 2.5 5.83334 4.36548 5.83334 6.66667C5.83334 8.96785 7.69882 10.8333 10 10.8333Z', 'M16.6667 17.5C16.6667 15.7319 15.9643 14.0362 14.7141 12.786C13.4638 11.5357 11.7681 10.8333 10 10.8333C8.2319 10.8333 6.53621 11.5357 5.28596 12.786C4.03572 14.0362 3.33334 15.7319 3.33334 17.5'],
    check: ['M16.6666 5L7.49998 14.1667L3.33331 10'],
    upload: ['M17.5 12.5V15.8333C17.5 16.2754 17.3244 16.6993 17.0118 17.0118C16.6993 17.3244 16.2754 17.5 15.8333 17.5H4.16667C3.72464 17.5 3.30072 17.3244 2.98816 17.0118C2.67559 16.6993 2.5 16.2754 2.5 15.8333V12.5', 'M14.1666 6.66667L9.99998 2.5L5.83331 6.66667', 'M10 2.5V12.5'],
    globe: ['M10 18.3333C14.6024 18.3333 18.3334 14.6024 18.3334 10C18.3334 5.39763 14.6024 1.66667 10 1.66667C5.39765 1.66667 1.66669 5.39763 1.66669 10C1.66669 14.6024 5.39765 18.3333 10 18.3333Z', 'M6.66669 10C6.66669 6.89728 7.86022 3.91346 10 1.66667C12.1398 3.91346 13.3334 6.89728 13.3334 10C13.3334 13.1027 12.1398 16.0865 10 18.3333C7.86022 16.0865 6.66669 13.1027 6.66669 10Z', 'M1.66669 10H18.3334'],
    'chevron-down': ['M5 7.5L10 12.5L15 7.5'],
    mail: ['M16.6667 3.33333H3.33335C2.41288 3.33333 1.66669 4.07953 1.66669 5V15C1.66669 15.9205 2.41288 16.6667 3.33335 16.6667H16.6667C17.5872 16.6667 18.3334 15.9205 18.3334 15V5C18.3334 4.07953 17.5872 3.33333 16.6667 3.33333Z', 'M18.3334 5.83333L10.8584 10.5833C10.6011 10.7445 10.3036 10.83 10 10.83C9.69642 10.83 9.39896 10.7445 9.14169 10.5833L1.66669 5.83333'],
    lock: ['M15.8333 9.16667H4.16667C3.24619 9.16667 2.5 9.91286 2.5 10.8333V16.6667C2.5 17.5871 3.24619 18.3333 4.16667 18.3333H15.8333C16.7538 18.3333 17.5 17.5871 17.5 16.6667V10.8333C17.5 9.91286 16.7538 9.16667 15.8333 9.16667Z', 'M5.83331 9.16667V5.83333C5.83331 4.72826 6.2723 3.66846 7.0537 2.88706C7.8351 2.10565 8.89491 1.66667 9.99998 1.66667C11.105 1.66667 12.1649 2.10565 12.9463 2.88706C13.7277 3.66846 14.1666 4.72826 14.1666 5.83333V9.16667'],
    eye: ['M1.71665 9.70833C1.64637 9.89643 1.64637 10.1036 1.71665 10.2917C2.39255 11.9328 3.54072 13.3362 5.01547 14.3237C6.49023 15.3113 8.22511 15.8385 9.99998 15.8385C11.7749 15.8385 13.5097 15.3113 14.9845 14.3237C16.4592 13.3362 17.6074 11.9328 18.2833 10.2917C18.3536 10.1036 18.3536 9.89643 18.2833 9.70833C17.6074 8.06719 16.4592 6.66381 14.9845 5.67625C13.5097 4.6887 11.7749 4.16147 9.99998 4.16147C8.22511 4.16147 6.49023 4.6887 5.01547 5.67625C3.54072 6.66381 2.39255 8.06719 1.71665 9.70833Z', 'M10 12.5C11.3807 12.5 12.5 11.3807 12.5 10C12.5 8.61929 11.3807 7.5 10 7.5C8.61929 7.5 7.5 8.61929 7.5 10C7.5 11.3807 8.61929 12.5 10 12.5Z'],
    image: ['M15.8333 2.5H4.16667C3.24619 2.5 2.5 3.24619 2.5 4.16667V15.8333C2.5 16.7538 3.24619 17.5 4.16667 17.5H15.8333C16.7538 17.5 17.5 16.7538 17.5 15.8333V4.16667C17.5 3.24619 16.7538 2.5 15.8333 2.5Z', 'M7.49998 9.16667C8.42045 9.16667 9.16665 8.42047 9.16665 7.5C9.16665 6.57953 8.42045 5.83333 7.49998 5.83333C6.57951 5.83333 5.83331 6.57953 5.83331 7.5C5.83331 8.42047 6.57951 9.16667 7.49998 9.16667Z', 'M17.5 12.5L14.925 9.925C14.6127 9.61458 14.1903 9.44035 13.75 9.44035C13.3097 9.44035 12.8873 9.61458 12.575 9.925L5 17.5'],
    video: ['M13.3333 10.8333L17.6833 13.7333C17.7463 13.7759 17.8198 13.8005 17.8957 13.8043C17.9717 13.8081 18.0473 13.7911 18.1142 13.755C18.1812 13.719 18.237 13.6653 18.2756 13.5997C18.3142 13.5342 18.3342 13.4594 18.3333 13.3833V6.61667C18.3323 6.54321 18.3118 6.47133 18.2741 6.40831C18.2363 6.3453 18.1825 6.2934 18.1182 6.25786C18.0539 6.22233 17.9814 6.20442 17.9079 6.20597C17.8345 6.20752 17.7627 6.22846 17.7 6.26667L13.3333 8.75', 'M11.6667 5H3.33335C2.41288 5 1.66669 5.74619 1.66669 6.66667V13.3333C1.66669 14.2538 2.41288 15 3.33335 15H11.6667C12.5872 15 13.3334 14.2538 13.3334 13.3333V6.66667C13.3334 5.74619 12.5872 5 11.6667 5Z'],
    clock: ['M10 18.3333C14.6024 18.3333 18.3334 14.6024 18.3334 10C18.3334 5.39763 14.6024 1.66667 10 1.66667C5.39765 1.66667 1.66669 5.39763 1.66669 10C1.66669 14.6024 5.39765 18.3333 10 18.3333Z', 'M10 5V10L13.3333 11.6667'],
    x: ['M15 5L5 15', 'M5 5L15 15'],
    'alert-circle': ['M10 18.3333C14.6024 18.3333 18.3334 14.6024 18.3334 10C18.3334 5.39763 14.6024 1.66667 10 1.66667C5.39765 1.66667 1.66669 5.39763 1.66669 10C1.66669 14.6024 5.39765 18.3333 10 18.3333Z', 'M10 6.66667V10', 'M10 13.3333H10.0083'],
    info: ['M9.99996 18.3333C14.6023 18.3333 18.3333 14.6024 18.3333 10C18.3333 5.39763 14.6023 1.66667 9.99996 1.66667C5.39759 1.66667 1.66663 5.39763 1.66663 10C1.66663 14.6024 5.39759 18.3333 9.99996 18.3333Z', 'M10 13.3333V10', 'M10 6.66667H10.0083'],
    grip: ['M7.49996 5.83333C7.9602 5.83333 8.33329 5.46024 8.33329 5C8.33329 4.53976 7.9602 4.16667 7.49996 4.16667C7.03972 4.16667 6.66663 4.53976 6.66663 5C6.66663 5.46024 7.03972 5.83333 7.49996 5.83333Z', 'M7.49996 10.8333C7.9602 10.8333 8.33329 10.4602 8.33329 10C8.33329 9.53976 7.9602 9.16667 7.49996 9.16667C7.03972 9.16667 6.66663 9.53976 6.66663 10C6.66663 10.4602 7.03972 10.8333 7.49996 10.8333Z', 'M7.49996 15.8333C7.9602 15.8333 8.33329 15.4602 8.33329 15C8.33329 14.5398 7.9602 14.1667 7.49996 14.1667C7.03972 14.1667 6.66663 14.5398 6.66663 15C6.66663 15.4602 7.03972 15.8333 7.49996 15.8333Z', 'M12.5 5.83333C12.9602 5.83333 13.3333 5.46024 13.3333 5C13.3333 4.53976 12.9602 4.16667 12.5 4.16667C12.0397 4.16667 11.6666 4.53976 11.6666 5C11.6666 5.46024 12.0397 5.83333 12.5 5.83333Z', 'M12.5 10.8333C12.9602 10.8333 13.3333 10.4602 13.3333 10C13.3333 9.53976 12.9602 9.16667 12.5 9.16667C12.0397 9.16667 11.6666 9.53976 11.6666 10C11.6666 10.4602 12.0397 10.8333 12.5 10.8333Z', 'M12.5 15.8333C12.9602 15.8333 13.3333 15.4602 13.3333 15C13.3333 14.5398 12.9602 14.1667 12.5 14.1667C12.0397 14.1667 11.6666 14.5398 11.6666 15C11.6666 15.4602 12.0397 15.8333 12.5 15.8333Z'],
    'arrow-left': ['M9.99996 15.8333L4.16663 10L9.99996 4.16667', 'M15.8333 10H4.16663'],
    'arrow-right': ['M4.16663 10H15.8333', 'M10 4.16667L15.8333 10L10 15.8333'],
    trash: ['M2.5 5H17.5', 'M15.8333 5V16.6667C15.8333 17.5 15 18.3333 14.1666 18.3333H5.83329C4.99996 18.3333 4.16663 17.5 4.16663 16.6667V5', 'M6.66663 5V3.33333C6.66663 2.5 7.49996 1.66667 8.33329 1.66667H11.6666C12.5 1.66667 13.3333 2.5 13.3333 3.33333V5'],
    rocket: ['M3.75004 13.75C2.50004 14.8 2.08337 17.9167 2.08337 17.9167C2.08337 17.9167 5.20004 17.5 6.25004 16.25C6.84171 15.55 6.83337 14.475 6.17504 13.825C5.85113 13.5158 5.42445 13.3372 4.9769 13.3234C4.52934 13.3095 4.09244 13.4614 3.75004 13.75Z', 'M10 12.5L7.5 10C7.94345 8.84952 8.50184 7.74672 9.16667 6.70833C10.1377 5.15582 11.4897 3.87754 13.0942 2.99508C14.6986 2.11261 16.5022 1.65531 18.3333 1.66667C18.3333 3.93333 17.6833 7.91667 13.3333 10.8333C12.2807 11.4989 11.164 12.0573 10 12.5Z', 'M7.50004 10H3.33337C3.33337 10 3.79171 7.475 5.00004 6.66667C6.35004 5.76667 9.16671 6.66667 9.16671 6.66667', 'M10 12.5V16.6667C10 16.6667 12.525 16.2083 13.3333 15C14.2333 13.65 13.3333 10.8333 13.3333 10.8333'],
    copy: ['M16.6666 6.66667H8.33329C7.41282 6.66667 6.66663 7.41286 6.66663 8.33333V16.6667C6.66663 17.5871 7.41282 18.3333 8.33329 18.3333H16.6666C17.5871 18.3333 18.3333 17.5871 18.3333 16.6667V8.33333C18.3333 7.41286 17.5871 6.66667 16.6666 6.66667Z', 'M3.33329 13.3333C2.41663 13.3333 1.66663 12.5833 1.66663 11.6667V3.33333C1.66663 2.41667 2.41663 1.66667 3.33329 1.66667H11.6666C12.5833 1.66667 13.3333 2.41667 13.3333 3.33333'],
    link: ['M8.33337 10.8333C8.69125 11.3118 9.14784 11.7077 9.67217 11.9941C10.1965 12.2806 10.7763 12.4509 11.3722 12.4936C11.9682 12.5363 12.5664 12.4503 13.1262 12.2415C13.686 12.0327 14.1943 11.7059 14.6167 11.2833L17.1167 8.78333C17.8757 7.99749 18.2957 6.94498 18.2862 5.85249C18.2767 4.76001 17.8385 3.71496 17.066 2.94242C16.2934 2.16989 15.2484 1.73169 14.1559 1.72219C13.0634 1.7127 12.0109 2.13267 11.225 2.89167L9.79171 4.31667', 'M11.6667 9.16667C11.3088 8.68823 10.8522 8.29235 10.3279 8.00588C9.80359 7.71942 9.22379 7.54907 8.62784 7.50639C8.03188 7.46371 7.43372 7.54969 6.87392 7.75852C6.31412 7.96734 5.80578 8.29411 5.38338 8.71667L2.88338 11.2167C2.12439 12.0025 1.70441 13.055 1.7139 14.1475C1.7234 15.24 2.1616 16.285 2.93413 17.0576C3.70667 17.8301 4.75172 18.2683 5.84421 18.2778C6.93669 18.2873 7.9892 17.8673 8.77504 17.1083L10.2 15.6833'],
    'bar-chart': ['M2.5 2.5V15.8333C2.5 16.2754 2.67559 16.6993 2.98816 17.0118C3.30072 17.3244 3.72464 17.5 4.16667 17.5H17.5', 'M15 14.1667V7.5', 'M10.8334 14.1667V4.16667', 'M6.66663 14.1667V11.6667'],
    sparkles: ['M8.28337 11.7167L3.33337 16.6667', 'M10 2.5L11.5834 7.33333L16.6667 9.16667L11.5834 11L10 15.8333L8.41671 11L3.33337 9.16667L8.41671 7.33333L10 2.5Z']
  };
  const FILLED = {
    upvote: '<path d="M10 3.33333L17.0833 15.4167H2.91667L10 3.33333Z" fill="currentColor"/>',
    google: '<path d="M18.8 10.2083C18.8 9.55833 18.7417 8.93333 18.6333 8.33333H10V11.8833H14.9333C14.7167 13.025 14.0667 13.9917 13.0917 14.6417V16.95H16.0667C17.8 15.35 18.8 13 18.8 10.2083Z" fill="#4285F4"/><path d="M9.99998 19.1667C12.475 19.1667 14.55 18.35 16.0667 16.95L13.0917 14.6417C12.275 15.1917 11.2333 15.525 9.99998 15.525C7.61665 15.525 5.59165 13.9167 4.86665 11.75H1.81665V14.1167C3.32498 17.1083 6.41665 19.1667 9.99998 19.1667Z" fill="#34A853"/><path d="M4.86671 11.7417C4.68337 11.1917 4.57504 10.6083 4.57504 10C4.57504 9.39167 4.68337 8.80833 4.86671 8.25833V5.89167H1.81671C1.19171 7.125 0.833374 8.51667 0.833374 10C0.833374 11.4833 1.19171 12.875 1.81671 14.1083L4.86671 11.7417Z" fill="#FBBC05"/><path d="M9.99998 4.48333C11.35 4.48333 12.55 4.95 13.5083 5.85L16.1333 3.225C14.5417 1.74167 12.475 0.833334 9.99998 0.833334C6.41665 0.833334 3.32498 2.89167 1.81665 5.89167L4.86665 8.25833C5.59165 6.09167 7.61665 4.48333 9.99998 4.48333Z" fill="#EA4335"/>'
  };
  function icon(name, cls) {
    const c = 'ic' + (cls ? ' ' + cls : '');
    if (FILLED[name]) return `<svg class="${c}" viewBox="0 0 20 20" fill="none" aria-hidden="true">${FILLED[name]}</svg>`;
    const paths = (P[name] || []).map(d => `<path d="${d}"/>`).join('');
    return `<svg class="${c}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  }

  // ---------- Logo (Figma component 10:68) ----------
  let logoN = 0;
  function logo() {
    const id = 'lg' + (++logoN);
    return `<svg viewBox="0 0 132 24" fill="none" role="img" aria-label="Hentity"><g fill="currentColor"><path d="M28.0859 20.9102V4H31.1094V11.0312H39.3359V4H42.3477V20.9102H39.3359V13.5742H31.1094V20.9102H28.0859Z"/><path d="M46.5312 20.9102V4H57.4766V6.54297H49.5547V11.125H57.043V13.5273H49.5547V18.3672H57.4766V20.9102H46.5312Z"/><path d="M61.2266 20.9102V4H63.8516L72.9219 16.7148L70.8359 15.6484H72.3477V4H75.2539V20.9102H72.6406L63.5703 8.18359L65.6562 9.25H64.1445V20.9102H61.2266Z"/><path d="M83.6445 20.9102V6.54297H78.4414V4H91.8711V6.54297H86.668V20.9102H83.6445Z"/><path d="M95.0469 20.9102V4H98.0703V20.9102H95.0469Z"/><path d="M106.449 20.9102V6.54297H101.246V4H114.676V6.54297H109.473V20.9102H106.449Z"/><path d="M122.527 20.9102V14.2422L116.598 4H119.902L123.934 11.2539H124.133L128.164 4H131.469L125.539 14.2422V20.9102H122.527Z"/><rect width="24" height="24" rx="12"/></g><g clip-path="url(#${id})"><rect width="13.7143" height="13.8129" transform="translate(5.14286 5.14286)" fill="var(--logo-knock,#fff)"/><g fill="currentColor"><circle cx="6.1295" cy="6.1295" r="4.6372"/><circle cx="18.1665" cy="18.0678" r="4.6372"/><rect width="6.41315" height="6.80781" transform="translate(13.2333 3.95891)"/><rect width="6.41315" height="6.80781" transform="translate(4.15622 13.4306)"/></g></g><defs><clipPath id="${id}"><rect width="13.7143" height="13.8129" transform="translate(5.14286 5.14286)"/></clipPath></defs></svg>`;
  }

  // ---------- Flags (Figma component 32:114) ----------
  const FLAG_BODY = {
    NG: '<path d="M18 0H0V12H18V0Z" fill="#008751"/><path d="M12 0H6V12H12V0Z" fill="white"/>',
    GH: '<path d="M18 0H0V4H18V0Z" fill="#CE1126"/><path d="M18 4H0V8H18V4Z" fill="#FCD116"/><path d="M18 8H0V12H18V8Z" fill="#006B3F"/><path d="M8.99991 4.19995L9.47991 5.47995L10.8399 5.51995L9.75991 6.35995L10.1399 7.67995L8.99991 6.91995L7.85991 7.67995L8.23991 6.35995L7.15991 5.51995L8.51991 5.47995L8.99991 4.19995Z" fill="black"/>',
    KE: '<path d="M18 0H0V12H18V0Z" fill="white"/><path d="M18 0H0V3.6H18V0Z" fill="black"/><path d="M18 4.19995H0V7.79995H18V4.19995Z" fill="#BB0000"/><path d="M18 8.40002H0V12H18V8.40002Z" fill="#006600"/><path d="M9.0001 9.20005C9.7733 9.20005 10.4001 7.76736 10.4001 6.00005C10.4001 4.23274 9.7733 2.80005 9.0001 2.80005C8.2269 2.80005 7.6001 4.23274 7.6001 6.00005C7.6001 7.76736 8.2269 9.20005 9.0001 9.20005Z" fill="#BB0000" stroke="black" stroke-width="0.4"/>',
    RW: '<path d="M18 0H0V12H18V0Z" fill="#20603D"/><path d="M18 0H0V9H18V0Z" fill="#FAD201"/><path d="M18 0H0V6H18V0Z" fill="#00A1DE"/><path d="M14.8001 3.80002C15.4628 3.80002 16.0001 3.26277 16.0001 2.60002C16.0001 1.93728 15.4628 1.40002 14.8001 1.40002C14.1374 1.40002 13.6001 1.93728 13.6001 2.60002C13.6001 3.26277 14.1374 3.80002 14.8001 3.80002Z" fill="#E5BE01"/>',
    ZA: '<path d="M18 0H0V12H18V0Z" fill="#E03C31"/><path d="M18 6H0V12H18V6Z" fill="#001489"/><path d="M0 0H2.8L9.6 4.8H18V7.2H9.6L2.8 12H0V0Z" fill="white"/><path d="M0 0.8L1.6 0L9 5.4H18V6.6H9L1.6 12L0 11.2V0.8Z" fill="#007749"/><path d="M0 2L6 6L0 10V2Z" fill="#FFB81C"/><path d="M0 3L4.4 6L0 9V3Z" fill="black"/>',
    MA: '<path d="M18 0H0V12H18V0Z" fill="#C1272D"/><path d="M9.00002 3.40002L10.52 8.10002L6.52002 5.20002H11.48L7.48002 8.10002L9.00002 3.40002Z" stroke="#006233" stroke-width="0.5"/>'
  };
  const COUNTRY = { NG: 'Nigeria', GH: 'Ghana', KE: 'Kenya', RW: 'Rwanda', ZA: 'South Africa', MA: 'Morocco' };
  let flagN = 0;
  function flag(cc) {
    const id = 'fl' + (++flagN);
    return `<svg class="flag" viewBox="0 0 18 12" fill="none" role="img" aria-label="${COUNTRY[cc] || cc}"><g clip-path="url(#${id})">${FLAG_BODY[cc] || ''}</g><rect x="0.5" y="0.5" width="17" height="11" rx="1.5" stroke="black" stroke-opacity="0.12"/><defs><clipPath id="${id}"><rect width="18" height="12" rx="2" fill="white"/></clipPath></defs></svg>`;
  }

  // ---------- Verified badge (Figma component 55:141, MD) ----------
  function verified(cls) {
    return `<svg class="verified${cls ? ' ' + cls : ''}" viewBox="0 0 20 20" fill="none" role="img" aria-label="Verified"><path d="M8.81087 1.01337C9.49609 0.429429 10.5039 0.429429 11.1891 1.01337L12.6098 2.22403C12.9034 2.47426 13.2685 2.62548 13.6531 2.65617L15.5137 2.80465C16.4111 2.87627 17.1237 3.5889 17.1954 4.48634L17.3438 6.34694C17.3745 6.73151 17.5257 7.0966 17.776 7.39023L18.9866 8.81087C19.5706 9.49609 19.5706 10.5039 18.9866 11.1891L17.776 12.6098C17.5257 12.9034 17.3745 13.2685 17.3438 13.6531L17.1954 15.5137C17.1237 16.4111 16.4111 17.1237 15.5137 17.1954L13.6531 17.3438C13.2685 17.3745 12.9034 17.5257 12.6098 17.776L11.1891 18.9866C10.5039 19.5706 9.49609 19.5706 8.81087 18.9866L7.39023 17.776C7.0966 17.5257 6.73151 17.3745 6.34694 17.3438L4.48634 17.1954C3.5889 17.1237 2.87627 16.4111 2.80465 15.5137L2.65617 13.6531C2.62548 13.2685 2.47426 12.9034 2.22403 12.6098L1.01337 11.1891C0.429429 10.5039 0.429429 9.49609 1.01337 8.81087L2.22403 7.39023C2.47426 7.0966 2.62548 6.73151 2.65617 6.34694L2.80465 4.48634C2.87627 3.5889 3.5889 2.87627 4.48634 2.80465L6.34694 2.65617C6.73151 2.62548 7.0966 2.47426 7.39023 2.22403L8.81087 1.01337Z" fill="currentColor"/><path d="M10.7871 9.1816H14.3754V10.9137C14.2315 10.8922 14.084 10.8813 13.9342 10.8813C12.3004 10.8815 10.976 12.2058 10.9759 13.8396C10.9759 14.0335 10.9951 14.2232 11.0307 14.4066H9.08738V10.8813H5.625V9.11368C5.82785 9.15766 6.03829 9.18158 6.2543 9.1816C7.88831 9.1816 9.21324 7.85666 9.21324 6.22265C9.21322 6.00664 9.1893 5.7962 9.14533 5.59335H10.7871V9.1816Z" fill="#fff"/></svg>`;
  }

  // ---------- Storage + session ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('hentity.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('hentity.' + k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem('hentity.' + k); } catch (e) {} }
  };
  const DEMO_USER = {
    name: 'Ada Okafor', username: 'ada', email: 'ada@ledgerline.app', headline: 'Founder of Ledgerline',
    bio: 'Building bookkeeping for Lagos traders. Ask me about mobile money reconciliation.',
    country: 'NG', city: 'Lagos', website: 'https://ledgerline.app', x: 'ada_builds', linkedin: 'linkedin.com/in/adaokafor', photo: null
  };
  function user() { return Object.assign({}, DEMO_USER, store.get('profile', {})); }
  function session() { return store.get('session', null); }
  function initials(name) { return (name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join('') || '?'; }
  function avatar(u, size, extra) {
    u = u || user();
    const cls = 'avatar' + (size ? ' avatar--' + size : '') + ' avatar--photo' + (extra ? ' ' + extra : '');
    if (u.photo) return `<span class="${cls} avatar--img" style="background-image:url('${u.photo}')" role="img" aria-label="${esc(u.name)}"></span>`;
    return `<span class="${cls}" aria-hidden="true">${initials(u.name)}</span>`;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // ---------- Theme ----------
  function applyTheme(t) { document.documentElement.dataset.theme = t === 'dark' ? 'dark' : 'light'; }
  applyTheme(store.get('theme', 'light'));

  // ---------- Toasts ----------
  function toast(msg) {
    let wrap = document.querySelector('.toasts');
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toasts'; wrap.setAttribute('role', 'status'); wrap.setAttribute('aria-live', 'polite'); document.body.appendChild(wrap); }
    const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = icon('check') + '<span>' + esc(msg) + '</span>';
    wrap.appendChild(t); setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .2s'; setTimeout(() => t.remove(), 220); }, 2600);
  }

  // ---------- Header ----------
  const NAV = [['Discover', '/'], ['Launches', '/launches'], ['Categories', '/directory'], ['Collections', '/directory#collections'], ['Community', '/community']];
  function unreadCount() { return store.get('unread', 3); }
  function header(active) {
    const s = session();
    const u = user();
    const links = NAV.map(([l, h]) => `<a href="${h}"${l === active ? ' aria-current="page"' : ''}>${l}</a>`).join('');
    const unread = unreadCount();
    const right = s
      ? `<a class="nav__icon${unread ? ' has-unread' : ''}" href="/notifications" aria-label="Notifications${unread ? ', ' + unread + ' unread' : ''}">${icon('bell', 'ic-18')}</a>
         <a class="btn btn--primary btn--sm" href="/submit">${icon('plus')}Submit</a>
         <button class="nav__avatar" type="button" aria-haspopup="menu" aria-expanded="false" data-account-btn>${avatar(u, null, '')}</button>`
      : `<a class="btn btn--ghost btn--sm" href="/signin">Sign in</a>
         <a class="btn btn--primary btn--sm" href="/submit">${icon('plus')}Submit</a>`;
    return `<header class="nav">
      <div class="nav__left"><a class="logo" href="/" aria-label="Hentity home">${logo()}</a><nav class="nav__links nav__desktop" aria-label="Primary">${links}</nav></div>
      <div class="nav__right nav__desktop">
        <form class="search" role="search" action="/directory"><span aria-hidden="true">${icon('search')}</span><input name="q" type="search" placeholder="Search products, makers, companies" aria-label="Search"><span class="kbd" aria-hidden="true">/</span></form>
        ${right}
      </div>
      <div class="nav__mobile">
        <a class="nav__icon" href="/directory" aria-label="Search">${icon('search', 'ic-20')}</a>
        ${s ? `<a class="nav__icon${unread ? ' has-unread' : ''}" href="/notifications" aria-label="Notifications">${icon('bell', 'ic-20')}</a>` : `<a class="btn btn--primary btn--sm" href="/signin">Sign in</a>`}
      </div>
    </header>`;
  }
  function tabbar(active) {
    const s = session();
    const items = [['Home', '/', 'home'], ['Directory', '/directory', 'compass'], ['Launch', '/submit', 'plus'], ['Alerts', '/notifications', 'bell'], ['Profile', s ? '/me' : '/signin', 'user']];
    return `<nav class="tabbar" aria-label="Tabs">${items.map(([l, h, ic]) => l === 'Launch'
      ? `<a class="tabbar__launch" href="${h}"${l === active ? ' aria-current="page"' : ''}><span class="pill">${icon(ic)}</span>${l}</a>`
      : `<a href="${h}"${l === active ? ' aria-current="page"' : ''}>${icon(ic)}${l}</a>`).join('')}</nav>`;
  }

  function accountMenu(btn) {
    closeMenus();
    const u = user();
    const unread = unreadCount();
    const dark = document.documentElement.dataset.theme === 'dark';
    const m = document.createElement('div');
    m.className = 'menu'; m.setAttribute('role', 'menu'); m.dataset.menu = '';
    m.innerHTML = `<div class="menu__head">${avatar(u, 40)}<div class="stack"><span class="t-label-md">${esc(u.name)}</span><span class="t-caption c-3">@${esc(u.username)} · Maker</span></div></div>
      <div class="menu__sep"></div>
      <a class="menu__item" role="menuitem" href="/makers/${esc(u.username)}">${icon('user')}Your profile</a>
      <a class="menu__item" role="menuitem" href="/my-products">${icon('rocket')}My products<span class="menu__meta">4</span></a>
      <a class="menu__item" role="menuitem" href="/makers/${esc(u.username)}#collections">${icon('bookmark')}Saved<span class="menu__meta">14</span></a>
      <a class="menu__item" role="menuitem" href="/notifications">${icon('bell')}Notifications${unread ? `<span class="menu__meta">${unread} new</span>` : ''}</a>
      <a class="menu__item" role="menuitem" href="/settings/profile">${icon('lock')}Settings</a>
      <div class="menu__sep"></div>
      <label class="menu__item" role="menuitemcheckbox" aria-checked="${dark}">${icon('eye')}Dark mode<span class="toggle" style="margin-left:auto"><input type="checkbox" data-theme-toggle ${dark ? 'checked' : ''} aria-label="Dark mode"><span class="toggle__track"></span></span></label>
      <a class="menu__item" role="menuitem" href="/guidelines">${icon('info')}Help &amp; guidelines</a>
      <div class="menu__sep"></div>
      <button class="menu__item menu__item--danger" role="menuitem" type="button" data-signout>${icon('arrow-left')}Sign out</button>`;
    document.body.appendChild(m);
    const r = btn.getBoundingClientRect();
    m.style.top = (r.bottom + window.scrollY + 8) + 'px';
    m.style.right = Math.max(16, document.documentElement.clientWidth - r.right) + 'px';
    btn.setAttribute('aria-expanded', 'true');
    const first = m.querySelector('.menu__item'); first && first.focus();
    m.addEventListener('keydown', e => {
      const items = [...m.querySelectorAll('.menu__item')];
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      if (e.key === 'Escape') { closeMenus(); btn.focus(); }
    });
  }
  function closeMenus() {
    document.querySelectorAll('[data-menu]').forEach(m => m.remove());
    document.querySelectorAll('[data-account-btn]').forEach(b => b.setAttribute('aria-expanded', 'false'));
  }

  function signOut() { store.del('session'); toast('Signed out'); setTimeout(() => { location.href = '/'; }, 500); }

  // global delegated handlers
  document.addEventListener('click', e => {
    const ab = e.target.closest('[data-account-btn]');
    if (ab) { e.stopPropagation(); if (ab.getAttribute('aria-expanded') === 'true') closeMenus(); else accountMenu(ab); return; }
    if (e.target.closest('[data-signout]')) { signOut(); return; }
    if (!e.target.closest('[data-menu]')) closeMenus();
  });
  document.addEventListener('change', e => {
    if (e.target.matches('[data-theme-toggle]')) { const t = e.target.checked ? 'dark' : 'light'; store.set('theme', t); applyTheme(t); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !e.target.closest('input,textarea,select,[contenteditable]')) {
      const s = document.querySelector('.search input'); if (s) { e.preventDefault(); s.focus(); }
    }
  });

  function mount(opts) {
    opts = opts || {};
    const h = document.querySelector('[data-header]');
    if (h) h.outerHTML = header(opts.active);
    const t = document.querySelector('[data-tabbar]');
    if (t) t.outerHTML = tabbar(opts.tab);
    document.querySelectorAll('[data-icon]').forEach(el => { el.outerHTML = icon(el.dataset.icon, el.dataset.cls); });
    document.querySelectorAll('[data-logo]').forEach(el => { el.innerHTML = logo(); });
    document.querySelectorAll('[data-flag]').forEach(el => { el.outerHTML = flag(el.dataset.flag); });
    document.querySelectorAll('[data-verified]').forEach(el => { el.outerHTML = verified(el.dataset.cls); });
    document.querySelectorAll('[data-avatar]').forEach(el => { el.outerHTML = avatar(user(), el.dataset.avatar, el.dataset.cls); });
    document.querySelectorAll('[data-user]').forEach(el => { const u = user(); el.textContent = el.dataset.user === 'firstName' ? u.name.split(' ')[0] : (u[el.dataset.user] || ''); });
  }

  // Simple form helpers
  function qs(s, r) { return (r || document).querySelector(s); }
  function qsa(s, r) { return [...(r || document).querySelectorAll(s)]; }
  function bindChips(root, onChange) {
    qsa('[data-chip]', root).forEach(c => c.addEventListener('click', () => {
      const single = c.closest('[data-single]');
      if (single) qsa('[data-chip]', single).forEach(o => o !== c && o.setAttribute('aria-pressed', 'false'));
      c.setAttribute('aria-pressed', c.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
      onChange && onChange();
    }));
  }
  function params() { return new URLSearchParams(location.search); }

  window.H = { icon, logo, flag, verified, avatar, initials, esc, store, user, session, toast, mount, header, tabbar, qs, qsa, bindChips, params, COUNTRY, applyTheme, DEMO_USER };
})();
