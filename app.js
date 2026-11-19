const children = document.getElementById("children");
const template = document.getElementById("childTemplate");

function addChild() {
    const child = template.content.cloneNode(true);

    child.querySelector(".remove").addEventListener("click", event => {
        event.target.closest(".child").remove();
    });

    children.appendChild(child);
}

document.getElementById("addChild").addEventListener("click", addChild);

addChild();

document.getElementById("intakeForm").addEventListener("submit", event => {
    event.preventDefault();

    const form = new FormData(event.target);

    const intake = {
        household: {
            zipCode: form.get("zipCode"),
            booksInHousehold: Number(form.get("booksInHousehold")),
            readers: Number(form.get("readers"))
        },
        parents: [{
            email: form.get("parentEmail"),
            firstName: form.querySelector('[name="parentFirstName"]').value,
            canRead: form.get("parentCanRead")
        }],
        children: [...children.querySelectorAll(".child")].map(child => ({
            firstName: child.querySelector('[name="firstName"]').value,
            language: child.querySelector('[name="language"]').value,
            booksReceived: Number(child.querySelector('[name="booksReceived"]').value),
            readingDays: Number(child.querySelector('[name="readingDays"]').value)
        }))
    };

    const output = document.getElementById("output");
    output.style.display = "block";
    output.textContent = JSON.stringify(intake, null, 2);
});