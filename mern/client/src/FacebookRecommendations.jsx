// Transcribed from the Facebook review screenshot supplied by Bravo's owner.
// Facebook recommendations are not star ratings or verified website reviews.
const recommendations = [
  {
    author: 'Cassidy Bierman',
    body: 'David & Ashley are both fantastic trainers. Our Great Pyrenees came a long way in basic obedience & just absolutely melted when they came into her sight. Someone asked David on his first night out with her how long she had been a service dog. They’re very in tune, can read situations before they happen & most importantly... have an abundance of patience 😉 highly recommend!',
  },
  {
    author: 'Jessica Post',
    body: 'They did an excellent job with our daughter’s 5 month old rescue pup. He was having issues with potty training and they informed us he had an obedience issue. Within 3 weeks we were down to just one accident in a week. Highly recommend!!',
  },
  {
    author: 'Andrea Leigh Duarte',
    body: "David is very knowledgeable and my dogs love him. he helped train my service dog Scout and is currently working with my husband to train our other dog. I wouldn't go anywhere else for training as long as I can work with David or Ashley",
  },
];

export default function FacebookRecommendations() {
  return <div className="facebook-recommendations" aria-labelledby="facebook-recommendations-title">
    <h3 id="facebook-recommendations-title">What our clients say</h3>
    <p className="facebook-recommendations-intro">Shared by Bravo clients on Facebook.</p>
    <div className="review-grid home-proof-reviews">
      {recommendations.map(review => <article className="panel" key={review.author}>
        <small>Facebook recommendation</small>
        <blockquote><p>{review.body}</p></blockquote>
        <strong>{review.author}</strong>
      </article>)}
    </div>
    <a className="inline-link facebook-recommendations-link" href="https://www.facebook.com/share/1DcYgGp3Sj/?mibextid=wwXIfr" target="_blank" rel="noopener noreferrer" aria-label="Visit Bravo on Facebook (opens in a new tab)">Visit Bravo on Facebook <span aria-hidden="true">↗</span></a>
  </div>;
}
