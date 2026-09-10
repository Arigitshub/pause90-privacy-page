# Pause90

Pause90 offers small printable tools for choosing one visible next action when a task feels too large or the day feels crowded.

## Start free

- [Read the complete task-shrinking exercise](https://arigitshub.github.io/pause90-privacy-page/make-a-task-smaller.html?src=partner)
- [Download the two-page One Tiny Win sample](https://github.com/Arigitshub/pause90-privacy-page/releases/download/v1.0.0/Pause90_One_Tiny_Win_Sample_v1.pdf)

No email or account is required for the free material.

## Existing printable tools

### One Tiny Win — $3 one time

A five-page PDF with the 90-second routine, Tiny Step Sizer, seven-use tracker, and pocket card.

[See One Tiny Win and its free sample](https://arigitshub.github.io/pause90-privacy-page/one-tiny-win.html?src=partner)

### Pocket Reset Kit — $9 one time

A 14-page PDF with seven guided versions, a seven-day practice, tracker, and pocket reference.

[See the Pocket Reset Kit and its free core exercise](https://arigitshub.github.io/pause90-privacy-page/kit.html?src=partner)

## Delivery

Stripe handles checkout. After verified payment, checkout redirects to a protected download endpoint that returns only the purchased PDF. Automated email recovery is available if the redirect is interrupted. The paid PDF files are excluded from the public static build.

Pause90 is sold by Zencore. These are general-wellness planning resources, not medical or mental-health treatment.

## Support and privacy

- [Privacy notice](https://arigitshub.github.io/pause90-privacy-page/privacy.html)
- Purchase support: [ari532477@gmail.com](mailto:ari532477@gmail.com)

## Repository checks

```bash
npm test
npm run build
```

The entitlement tests verify that only completed, paid, live-mode orders for the recognized product, amount, and currency can access a PDF. Refunded, disputed, unpaid, underpaid, unrelated, and test-mode sessions are rejected.
