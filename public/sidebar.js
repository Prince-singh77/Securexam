(function () {

    const aside = document.getElementById("sidebar");
    if (!aside) return;

    const current = window.location.pathname.split("/").pop();
    const user = JSON.parse(localStorage.getItem("user") || "null");
    const isStudent = user && user.role === "student";

    const groups = isStudent
        ? [
            {
                label: "WORKSPACE",
                items: [
                    ["classes.html", "▣", "My Classes"],
                    ["myexams.html", "▤", "My Exams"]
                ]
            }
        ]
        : [
            {
                label: "WORKSPACE",
                items: [
                    ["dashboard.html", "⌂", "Dashboard"],
                    ["classes.html", "▣", "My Classes"],
                    ["attendance.html", "◉", "Attendance"],
                    ["exams.html", "▤", "Exams"],
                    ["questions.html", "☷", "Question Bank"]
                  
                ]
            },
            {
                label: "INSIGHTS",
                items: [
    ["results.html", "◒", "Results"],
    ["security.html", "◈", "Security Reports"]
]
            }
        ];

    let html =
        '<div class="sidebar-brand"><div class="brand-logo small">S</div>' +
        '<div><strong>SecureExam</strong><span>Secure academics</span></div></div>';

    groups.forEach((group) => {
        html += '<div class="sidebar-section"><p class="sidebar-label">' + group.label + "</p>";
        group.items.forEach((item) => {
            html +=
                '<a href="' + item[0] + '" class="nav-item' +
                (item[0] === current ? " active" : "") + '"><span>' +
                item[1] + "</span>" + item[2] + "</a>";
        });
        html += "</div>";
    });

         html +=
          '<div class="sidebar-bottom">' +
          '<button class="logout-btn" onclick="logout()">↪ Sign out</button></div>';

    aside.innerHTML = html;
})();