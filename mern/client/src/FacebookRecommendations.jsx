import ReviewPreview from './ReviewPreview';
// Transcribed from review screenshots supplied by Bravo’s owner.
// Google ratings are visible in the supplied screenshots.
// Five-star ratings were explicitly confirmed by Bravo’s owner after supplying the screenshot.
// These remain separate from verified website-account ratings.
import ReviewStars from './ReviewStars';
const recommendations = [
  {
    rating: 5,
    source: 'Google review',
    author: 'Tamyra Borg',
    excerpt: 'Absolutely love working with David and Ashley!! Our dog Max is doing great!!',
    body: "Absolutely love working with David and Ashley!! Our dog Max is doing great!! He's learning to work with us, out of choice, love and respect, not because he's going to get a treat, then only obey the trainers commands. Its an absolute joy to see the difference in Max. He's living his best like ❤️🐕 Thank-you so much for all you're doing for us!!!!",
  },
  {
    rating: 5,
    source: 'Google review',
    author: 'Waneta Malsom',
    excerpt: 'It’s remarkable what they have accomplished in just 4 weeks. They are amazing!!',
    body: 'We just got done with a month of training for our Dogs, Benny and Huck. We moved from a home that had a huge fenced in backyard to a home that doesn’t have any fence at all and we were having trouble with one of our dogs peeing in the house, so we thought we would try Bravo K9 Solutions. Not only have we not had any accidents for a month, they have taught them to be outside without a lease. Didn’t think I would ever see the day that I could open up our back door and just let the dogs out. It’s remarkable what they have accomplished in just 4 weeks. They are amazing!!',
  },

  {
    rating: 5,
    author: 'Cassidy Bierman',
    excerpt: 'David & Ashley are both fantastic trainers. Our Great Pyrenees came a long way in basic obedience',
    body: 'David & Ashley are both fantastic trainers. Our Great Pyrenees came a long way in basic obedience & just absolutely melted when they came into her sight. Someone asked David on his first night out with her how long she had been a service dog. They’re very in tune, can read situations before they happen & most importantly... have an abundance of patience 😉 highly recommend!',
  },
  {
    rating: 5,
    author: 'Jessica Post',
    excerpt: 'Within 3 weeks we were down to just one accident in a week. Highly recommend!!',
    body: 'They did an excellent job with our daughter’s 5 month old rescue pup. He was having issues with potty training and they informed us he had an obedience issue. Within 3 weeks we were down to just one accident in a week. Highly recommend!!',
  },
  {
    rating: 5,
    author: 'Andrea Leigh Duarte',
    excerpt: "I wouldn't go anywhere else for training as long as I can work with David or Ashley",
    body: "David is very knowledgeable and my dogs love him. he helped train my service dog Scout and is currently working with my husband to train our other dog. I wouldn't go anywhere else for training as long as I can work with David or Ashley",
  },
];

export default function FacebookRecommendations() {
  return <div className="facebook-recommendations" aria-labelledby="facebook-recommendations-title">
    <h3 id="facebook-recommendations-title">What our clients say</h3>
    <p className="facebook-recommendations-intro">Shared by Bravo clients on Google and Facebook.</p>
    <div className="review-grid home-proof-reviews">
      {recommendations.map(review => <article className="panel" key={review.author}>
        <ReviewStars rating={review.rating}/><small>{review.source || 'Facebook recommendation'}</small>
        <ReviewPreview body={review.body} excerpt={review.excerpt} author={review.author}/>
        <strong>{review.author}</strong>
      </article>)}
    </div>
    <a className="inline-link facebook-recommendations-link" href="https://www.facebook.com/share/1DcYgGp3Sj/?mibextid=wwXIfr" target="_blank" rel="noopener noreferrer" aria-label="Visit Bravo on Facebook (opens in a new tab)">Visit Bravo on Facebook <span aria-hidden="true">↗</span></a>
  </div>;
}
